import { z } from 'zod';
import type { ConditionInput } from '../engine/evaluate-condition';
import { assessRisk, resolveBand } from '../engine/score-quote';
import {
  DERIVED_POSTCODE_SOURCE,
  derivePostcodeFields,
  isDerivedPostcodeField,
  SAMPLE_POSTCODE_FOR,
} from '../validation/postcode';
import {
  QUOTE_REQUEST_FIELDS,
  quoteRequestFieldSchema,
  quoteRequestSchema,
  type ConditionField,
  type QuoteRequestField,
} from '../validation/quote-request.schema';
import type { Condition, Factor, KnowledgeBase, LeafCondition } from './kb.schema';

// KB linter: finds rule problems the schema can't see (overlaps, gaps, dead rules, unreachable
// bands, stacking). It works by probing, not by reasoning about each operator: it builds probe
// values per request field from the KB's own literals and the request schema's limits, then
// evaluates every factor on every combination with the real engine (evaluateCondition/assessRisk).
// Probing tests the boundaries the rules mention; it is a strong check, not a proof.

export type LintLevel = 'warning' | 'info';
export type LintKind = 'overlap' | 'gap' | 'dead-rule' | 'unreachable-band' | 'stacking' | 'probe-limit';

export interface LintFinding {
  level: LintLevel;
  kind: LintKind;
  factorIds: string[];
  message: string;
}

/** Above this many probe combinations the linter reports a note instead of probing. */
export const MAX_PROBE_COMBINATIONS = 200_000;

/** A value for fields no rule reads; it must never matter. */
const UNUSED_FIELD_PLACEHOLDER = 'probe';

/** Every request field → any value. Exhaustive over the field enum, so it types a probe request without a cast. */
const probeRequestSchema = z.record(quoteRequestFieldSchema, z.unknown());

const isRequestField = (field: ConditionField): field is QuoteRequestField =>
  QUOTE_REQUEST_FIELDS.some((requestField) => requestField === field);

/**
 * The request field whose probes cover a condition field. Derived postcode fields are probed
 * through `postcode`, so area, district and postcode always agree in a probe.
 */
const probedFieldFor = (field: ConditionField): QuoteRequestField =>
  isRequestField(field) ? field : DERIVED_POSTCODE_SOURCE;

/** The leaf's literals, as values of its probed field (a district "EX4" becomes the postcode "EX4 1AA"). */
function probeLiteralsOf(leaf: LeafCondition): unknown[] {
  const literals = literalsOf(leaf);
  const { field } = leaf;
  if (!isDerivedPostcodeField(field)) return literals;
  return literals.filter((value): value is string => typeof value === 'string').map(SAMPLE_POSTCODE_FOR[field]);
}

/** The engine input for a probe: the request values plus the postcode fields derived from them. */
function toProbeInput(request: Record<QuoteRequestField, unknown>): ConditionInput {
  const postcode = request[DERIVED_POSTCODE_SOURCE];
  return { ...request, ...derivePostcodeFields(typeof postcode === 'string' ? postcode : '') };
}

function leavesOf(condition: Condition): LeafCondition[] {
  if ('all' in condition) return condition.all.flatMap(leavesOf);
  if ('any' in condition) return condition.any.flatMap(leavesOf);
  if ('not' in condition) return leavesOf(condition.not);
  return [condition];
}

/** Every literal a leaf compares against (value, values, min, max), read generically. */
function literalsOf(leaf: LeafCondition): unknown[] {
  return Object.entries(leaf)
    .filter(([key]) => key !== 'field' && key !== 'operator')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]));
}

const uniqueSorted = (values: readonly number[]): number[] => [...new Set(values)].sort((a, b) => a - b);

/** Probe values for one field, derived from the KB's literals and the request schema's limits. */
function probesFor(field: QuoteRequestField, literals: readonly unknown[]): unknown[] {
  const schema = quoteRequestSchema.shape[field];

  if (schema instanceof z.ZodNumber) {
    const numbers = literals.filter((value): value is number => typeof value === 'number');
    const lower = schema.minValue ?? Math.min(0, ...numbers);
    const upper = schema.maxValue ?? Math.max(lower, ...numbers) + 1;
    const clamp = (value: number) => Math.min(upper, Math.max(lower, value));
    const candidates = [lower, lower + 1, upper, ...numbers.flatMap((n) => [n - 1, n, n + 1])].map(clamp);
    // Keep only values the request schema accepts (e.g. propertyValue > 0, whole-number ages).
    return uniqueSorted(candidates).filter((value) => schema.safeParse(value).success);
  }

  if (schema instanceof z.ZodEnum) return [...schema.options];

  // Free-text fields (strings, the normalised postcode): the literals the rules use, plus one value
  // that matches none of them (so "no rule applies" is also probed).
  const strings = [...new Set(literals.filter((value): value is string => typeof value === 'string'))];
  const matchesAny = (candidate: string) =>
    strings.some((s) => candidate.toUpperCase().startsWith(s.toUpperCase()));
  const neutral = ['ZZ9 9ZZ', 'QQ1 1QQ', '~unmatched~'].find((candidate) => !matchesAny(candidate)) ?? '~unmatched~';
  return [...strings, neutral];
}

interface Probe {
  input: ConditionInput;
  applied: ReadonlySet<string>;
  band: string;
}

function* combinations(
  fields: readonly QuoteRequestField[],
  values: ReadonlyMap<QuoteRequestField, unknown[]>,
): Generator<Map<QuoteRequestField, unknown>> {
  const [first, ...rest] = fields;
  if (first === undefined) {
    yield new Map<QuoteRequestField, unknown>();
    return;
  }
  for (const tail of combinations(rest, values)) {
    for (const value of values.get(first) ?? []) yield new Map(tail).set(first, value);
  }
}

const describeInput = (probe: Probe, fields: readonly ConditionField[]): string =>
  fields.map((field) => `${field} = ${JSON.stringify(probe.input[field])}`).join(', ');

export function lintKnowledgeBase(kb: KnowledgeBase): LintFinding[] {
  const findings: LintFinding[] = [];
  const leavesByFactor = new Map(kb.factors.map((factor) => [factor.id, leavesOf(factor.condition)]));
  const allLeaves = [...leavesByFactor.values()].flat();
  const usedFields = QUOTE_REQUEST_FIELDS.filter((field) => allLeaves.some((leaf) => probedFieldFor(leaf.field) === field));

  const probeValues = new Map<QuoteRequestField, unknown[]>();
  for (const field of usedFields) {
    const literals = allLeaves.filter((leaf) => probedFieldFor(leaf.field) === field).flatMap(probeLiteralsOf);
    probeValues.set(field, probesFor(field, literals));
  }

  const total = usedFields.reduce((product, field) => product * (probeValues.get(field)?.length ?? 1), 1);
  if (total > MAX_PROBE_COMBINATIONS) {
    return [{
      level: 'info',
      kind: 'probe-limit',
      factorIds: [],
      message: `Skipped linting: ${total} probe combinations exceed the limit of ${MAX_PROBE_COMBINATIONS}`,
    }];
  }

  const probes: Probe[] = [];
  for (const combo of combinations(usedFields, probeValues)) {
    const input = toProbeInput(
      probeRequestSchema.parse(
        Object.fromEntries(
          QUOTE_REQUEST_FIELDS.map((field) => [field, combo.has(field) ? combo.get(field) : UNUSED_FIELD_PLACEHOLDER]),
        ),
      ),
    );
    const { appliedFactors, riskScore } = assessRisk(input, kb);
    probes.push({ input, applied: new Set(appliedFactors.map((f) => f.id)), band: resolveBand(riskScore, kb).name });
  }

  // Dead rules.
  for (const factor of kb.factors) {
    if (!probes.some((probe) => probe.applied.has(factor.id))) {
      const fields = [...new Set((leavesByFactor.get(factor.id) ?? []).map((leaf) => leaf.field))];
      const limits = fields.map((field) => describeLimits(field)).filter(Boolean).join('; ');
      findings.push({
        level: 'warning',
        kind: 'dead-rule',
        factorIds: [factor.id],
        message: `Factor "${factor.id}" never applies for any probe input${limits ? ` (request limits: ${limits})` : ''}`,
      });
    }
  }

  // Overlaps and gaps within groups.
  const groups = new Map<string, Factor[]>();
  for (const factor of kb.factors) {
    if (factor.group !== undefined) groups.set(factor.group, [...(groups.get(factor.group) ?? []), factor]);
  }
  for (const [group, members] of groups) {
    const ids = members.map((factor) => factor.id);
    const groupFields = [...new Set(members.flatMap((f) => (leavesByFactor.get(f.id) ?? []).map((leaf) => leaf.field)))];

    const overlapping = probes.filter((probe) => ids.filter((id) => probe.applied.has(id)).length >= 2);
    const firstOverlap = overlapping[0];
    if (firstOverlap !== undefined) {
      const both = ids.filter((id) => firstOverlap.applied.has(id));
      findings.push({
        level: 'warning',
        kind: 'overlap',
        factorIds: both,
        message: `Group "${group}": ${both.join(' and ')} both apply when ${describeInput(firstOverlap, groupFields)}`,
      });
    }

    // Gaps are only meaningful along one numeric field.
    const [field] = groupFields;
    if (groupFields.length === 1 && field !== undefined && isRequestField(field) && quoteRequestSchema.shape[field] instanceof z.ZodNumber) {
      const coverage = (probeValues.get(field) ?? []).map((value) => ({
        value,
        covered: probes.some((p) => p.input[field] === value && ids.some((id) => p.applied.has(id))),
      }));
      coverage.forEach(({ value, covered }, index) => {
        if (covered) return;
        const below = coverage.slice(0, index).reverse().find((c) => c.covered);
        const above = coverage.slice(index + 1).find((c) => c.covered);
        if (below !== undefined && above !== undefined) {
          findings.push({
            level: 'warning',
            kind: 'gap',
            factorIds: ids,
            message: `Group "${group}": no factor covers ${field} = ${JSON.stringify(value)}, between covered values ${JSON.stringify(below.value)} and ${JSON.stringify(above.value)}`,
          });
        }
      });
    }
  }

  // Unreachable bands.
  const reached = new Set(probes.map((probe) => probe.band));
  for (const [name, band] of Object.entries(kb.riskBands)) {
    if (!reached.has(name)) {
      findings.push({
        level: 'warning',
        kind: 'unreachable-band',
        factorIds: [],
        message: `No probe input reaches band "${name}" (${band.min}–${band.max})`,
      });
    }
  }

  // Stacking: A only ever applies together with B, so their points add up.
  for (const a of kb.factors) {
    const withA = probes.filter((probe) => probe.applied.has(a.id));
    if (withA.length === 0) continue;
    for (const b of kb.factors) {
      if (a.id === b.id || (a.group !== undefined && a.group === b.group)) continue;
      if (withA.every((probe) => probe.applied.has(b.id))) {
        findings.push({
          level: 'info',
          kind: 'stacking',
          factorIds: [a.id, b.id],
          message: `"${a.id}" only applies together with "${b.id}", so their points add up (${a.points} + ${b.points} = ${a.points + b.points})`,
        });
      }
    }
  }

  return findings;
}

function describeLimits(field: ConditionField): string {
  if (!isRequestField(field)) return '';
  const schema = quoteRequestSchema.shape[field];
  if (!(schema instanceof z.ZodNumber)) return '';
  return `${field} ${schema.minValue ?? '-∞'}–${schema.maxValue ?? '∞'}`;
}
