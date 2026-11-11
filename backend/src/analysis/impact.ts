import { roundToPence, scoreQuote } from '../engine/score-quote';
import type { Factor, KnowledgeBase } from '../kb/kb.schema';
import type { QuoteRequest } from '../validation/quote-request.schema';

// Impact preview: how would a candidate KB change prices for a book of customers?
// Pure: every price comes from scoreQuote, so there is no second copy of the scoring logic.

export interface BandTransition {
  from: string;
  to: string;
  customers: number;
}

export interface Mover {
  customer: QuoteRequest;
  oldBand: string;
  newBand: string;
  oldAnnualPremium: number;
  newAnnualPremium: number;
  change: number;
}

export interface FactorDiff {
  added: string[];
  removed: string[];
  pointsChanged: { id: string; from: number; to: number }[];
  conditionChanged: string[];
  /** Other factor-level edits that may not move prices: description, perOccurrence, group. */
  otherChanged: string[];
}

export interface ImpactReport {
  customers: number;
  movedUp: { count: number; percent: number };
  movedDown: { count: number; percent: number };
  unchanged: { count: number; percent: number };
  /** Band pairs, including stays (STANDARD → STANDARD), largest first. */
  bandTransitions: BandTransition[];
  premium: {
    totalBefore: number;
    totalAfter: number;
    totalChange: number;
    totalChangePercent: number;
    averageChange: number;
  };
  /** Up to 5 customers with the largest absolute annual premium change. */
  biggestMovers: Mover[];
  factorDiff: FactorDiff;
  /** Top-level settings that differ: basePremium, coverageLoadFactor, riskBands, version, ... */
  settingsChanged: string[];
}

/** JSON with sorted object keys, so key order never counts as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameJson = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

export function diffFactors(base: readonly Factor[], candidate: readonly Factor[]): FactorDiff {
  const baseById = new Map(base.map((factor) => [factor.id, factor]));
  const candidateById = new Map(candidate.map((factor) => [factor.id, factor]));
  const diff: FactorDiff = { added: [], removed: [], pointsChanged: [], conditionChanged: [], otherChanged: [] };

  for (const factor of candidate) if (!baseById.has(factor.id)) diff.added.push(factor.id);
  for (const factor of base) {
    const next = candidateById.get(factor.id);
    if (next === undefined) {
      diff.removed.push(factor.id);
      continue;
    }
    if (factor.points !== next.points) diff.pointsChanged.push({ id: factor.id, from: factor.points, to: next.points });
    if (!sameJson(factor.condition, next.condition)) diff.conditionChanged.push(factor.id);
    const { points: _p1, condition: _c1, ...restBefore } = factor;
    const { points: _p2, condition: _c2, ...restAfter } = next;
    if (!sameJson(restBefore, restAfter)) diff.otherChanged.push(factor.id);
  }
  return diff;
}

function diffSettings(base: KnowledgeBase, candidate: KnowledgeBase): string[] {
  const { factors: _baseFactors, ...baseSettings } = base;
  const { factors: _candidateFactors, ...candidateSettings } = candidate;
  const before = new Map<string, unknown>(Object.entries(baseSettings));
  const after = new Map<string, unknown>(Object.entries(candidateSettings));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => !sameJson(before.get(key), after.get(key))).sort();
}

/** Band name → rank (0 = lowest risk), by `min` within its own KB, so renamed bands still compare. */
function bandRanks(kb: KnowledgeBase): Map<string, number> {
  const ordered = Object.entries(kb.riskBands).sort(([, a], [, b]) => a.min - b.min);
  return new Map(ordered.map(([name], index) => [name, index]));
}

const share = (count: number, total: number) => ({
  count,
  percent: total === 0 ? 0 : roundToPence((count / total) * 100),
});

export function compareKnowledgeBases(
  baseKb: KnowledgeBase,
  candidateKb: KnowledgeBase,
  book: readonly QuoteRequest[],
): ImpactReport {
  const baseRanks = bandRanks(baseKb);
  const candidateRanks = bandRanks(candidateKb);
  const transitions = new Map<string, BandTransition>();
  const movers: Mover[] = [];
  let up = 0;
  let down = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const customer of book) {
    const before = scoreQuote(customer, baseKb);
    const after = scoreQuote(customer, candidateKb);
    const rankChange = (candidateRanks.get(after.riskBand) ?? 0) - (baseRanks.get(before.riskBand) ?? 0);
    if (rankChange > 0) up += 1;
    if (rankChange < 0) down += 1;

    const key = `${before.riskBand}\u0000${after.riskBand}`;
    const transition = transitions.get(key) ?? { from: before.riskBand, to: after.riskBand, customers: 0 };
    transition.customers += 1;
    transitions.set(key, transition);

    totalBefore += before.annualPremium;
    totalAfter += after.annualPremium;
    movers.push({
      customer,
      oldBand: before.riskBand,
      newBand: after.riskBand,
      oldAnnualPremium: before.annualPremium,
      newAnnualPremium: after.annualPremium,
      change: roundToPence(after.annualPremium - before.annualPremium),
    });
  }

  const customers = book.length;
  const totalChange = roundToPence(totalAfter - totalBefore);
  return {
    customers,
    movedUp: share(up, customers),
    movedDown: share(down, customers),
    unchanged: share(customers - up - down, customers),
    bandTransitions: [...transitions.values()].sort(
      (a, b) => b.customers - a.customers || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
    premium: {
      totalBefore: roundToPence(totalBefore),
      totalAfter: roundToPence(totalAfter),
      totalChange,
      totalChangePercent: totalBefore === 0 ? 0 : roundToPence((totalChange / totalBefore) * 100),
      averageChange: customers === 0 ? 0 : roundToPence(totalChange / customers),
    },
    // A stable sort keeps book order among equal changes, so the report is reproducible.
    biggestMovers: movers
      .filter((mover) => mover.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5),
    factorDiff: diffFactors(baseKb.factors, candidateKb.factors),
    settingsChanged: diffSettings(baseKb, candidateKb),
  };
}

/** True when the candidate changes nothing: no KB edits and no price or band movement. */
export function hasNoDifferences(report: ImpactReport): boolean {
  const { factorDiff: d } = report;
  return (
    d.added.length + d.removed.length + d.pointsChanged.length + d.conditionChanged.length + d.otherChanged.length === 0 &&
    report.settingsChanged.length === 0 &&
    report.movedUp.count + report.movedDown.count === 0 &&
    report.premium.totalChange === 0
  );
}
