import { z } from 'zod';
import { conditionFieldSchema } from '../validation/quote-request.schema';

/** KB file shapes this backend can interpret. Bump when kb.schema.ts changes incompatibly. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

/** A request field or a derived postcode field (postcodeArea, postcodeDistrict). */
const field = conditionFieldSchema;
const scalar = z.union([z.string(), z.number(), z.boolean()]);
const scalarList = z.array(scalar).min(1);
const range = { min: z.number(), max: z.number() };
const minNotAboveMax = (c: { min: number; max: number }): boolean => c.min <= c.max;
const minNotAboveMaxError = { message: '"min" must not be greater than "max"', path: ['max'] };

/** One strict object per operator, so each operator accepts exactly its own keys. */
const leafSchemas = [
  z.strictObject({ field, operator: z.literal('eq'), value: scalar }),
  z.strictObject({ field, operator: z.literal('neq'), value: scalar }),
  z.strictObject({ field, operator: z.literal('in'), values: scalarList }),
  z.strictObject({ field, operator: z.literal('not_in'), values: scalarList }),
  z.strictObject({ field, operator: z.literal('gt'), value: z.number() }),
  z.strictObject({ field, operator: z.literal('gte'), value: z.number() }),
  z.strictObject({ field, operator: z.literal('lt'), value: z.number() }),
  z.strictObject({ field, operator: z.literal('lte'), value: z.number() }),
  z
    .strictObject({ field, operator: z.literal('between'), ...range })
    .refine(minNotAboveMax, minNotAboveMaxError),
  z
    .strictObject({ field, operator: z.literal('outside_range'), ...range })
    .refine(minNotAboveMax, minNotAboveMaxError),
  z.strictObject({ field, operator: z.literal('starts_with'), values: z.array(z.string().min(1)).min(1) }),
] as const;

/** Every operator name the schema accepts, in declaration order. */
export const OPERATOR_NAMES = leafSchemas.map((schema) => schema.shape.operator.value);

const describeUnknownOperator = (input: unknown): string => {
  const operator =
    typeof input === 'object' && input !== null && 'operator' in input ? input.operator : undefined;
  return `Unknown operator ${JSON.stringify(operator)}. Expected one of: ${OPERATOR_NAMES.join(', ')}`;
};

export const leafConditionSchema = z.discriminatedUnion('operator', leafSchemas, {
  error: (issue) =>
    issue.code === 'invalid_union' ? describeUnknownOperator(issue.input) : undefined,
});

/**
 * The key that identifies each branch of `conditionSchema`, in the same order as its options.
 * Used only to pick the relevant branch when reporting errors (see formatKbIssues).
 */
export const CONDITION_BRANCH_KEYS = ['operator', 'all', 'any', 'not'] as const;

/** A leaf comparison, or an all / any / not combinator over nested conditions (any depth). */
export const conditionSchema = z.union([
  leafConditionSchema,
  z.strictObject({
    get all() {
      return z.array(conditionSchema).min(1);
    },
  }),
  z.strictObject({
    get any() {
      return z.array(conditionSchema).min(1);
    },
  }),
  z.strictObject({
    get not() {
      return conditionSchema;
    },
  }),
]);

export const factorSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, 'Must be snake_case'),
  description: z.string().trim().min(1),
  condition: conditionSchema,
  points: z.number().int().nonnegative(),
  perOccurrence: z.boolean().optional(),
  /** Factors sharing a group are meant to be either/or (the linter warns on overlaps and gaps). */
  group: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, 'Must be snake_case').optional(),
});

export const riskBandSchema = z
  .strictObject({
    min: z.number().int().nonnegative(),
    max: z.number().int(),
    multiplier: z.number().positive(),
    summary: z.string().trim().min(1),
  })
  .refine(minNotAboveMax, minNotAboveMaxError);

export const knowledgeBaseSchema = z
  .strictObject({
    schemaVersion: z.number().int(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a semantic version, e.g. "1.2.0"'),
    basePremium: z.number().positive(),
    coverageLoadFactor: z.number().positive(),
    riskBands: z.record(z.string().min(1), riskBandSchema),
    factors: z.array(factorSchema).min(1),
  })
  .superRefine((kb, ctx) => {
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(kb.schemaVersion)) {
      ctx.addIssue({
        code: 'custom',
        path: ['schemaVersion'],
        message: `Unsupported schemaVersion ${kb.schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
      });
    }

    const firstIndexById = new Map<string, number>();
    kb.factors.forEach((factor, index) => {
      const firstIndex = firstIndexById.get(factor.id);
      if (firstIndex === undefined) {
        firstIndexById.set(factor.id, index);
      } else {
        ctx.addIssue({
          code: 'custom',
          path: ['factors', index, 'id'],
          message: `Duplicate factor id "${factor.id}" (first used at factors[${firstIndex}])`,
        });
      }
      if (factor.perOccurrence === true && !('operator' in factor.condition)) {
        ctx.addIssue({
          code: 'custom',
          path: ['factors', index, 'perOccurrence'],
          message: `Factor "${factor.id}": perOccurrence is only allowed on a leaf condition, not on all/any/not`,
        });
      }
    });

    const bands = Object.entries(kb.riskBands).sort(([, a], [, b]) => a.min - b.min);
    const [first] = bands;
    if (first === undefined) {
      ctx.addIssue({ code: 'custom', path: ['riskBands'], message: 'At least one risk band is required' });
      return;
    }
    if (first[1].min !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['riskBands', first[0], 'min'],
        message: `The lowest band "${first[0]}" must start at 0, not ${first[1].min}`,
      });
    }
    bands.slice(1).forEach(([name, band], i) => {
      const previous = bands[i];
      if (previous === undefined) return;
      const [previousName, previousBand] = previous;
      const expectedMin = previousBand.max + 1;
      if (band.min !== expectedMin) {
        const problem = band.min < expectedMin ? 'overlaps' : 'leaves a gap after';
        ctx.addIssue({
          code: 'custom',
          path: ['riskBands', name, 'min'],
          message: `Band "${name}" (${band.min}–${band.max}) ${problem} band "${previousName}" (${previousBand.min}–${previousBand.max}); expected min ${expectedMin}`,
        });
      }
    });
  });

export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;
export type Factor = z.infer<typeof factorSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type LeafCondition = z.infer<typeof leafConditionSchema>;
export type RiskBand = z.infer<typeof riskBandSchema>;
export type OperatorName = LeafCondition['operator'];

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc === '' ? String(key) : `${acc}.${String(key)}`;
  }, '');

/**
 * Turns Zod issues into one readable line per problem, e.g.
 * `factors[2].condition.operator: Unknown operator "greater". Expected one of: eq, ...`.
 *
 * A failed `conditionSchema` union reports every branch's errors. When the input has one of
 * CONDITION_BRANCH_KEYS, only that branch's errors are relevant, so we descend into it.
 */
export function formatKbIssues(error: z.ZodError, basePath: readonly PropertyKey[] = []): string[] {
  return error.issues.flatMap((issue) => formatIssue(issue, basePath));
}

function formatIssue(issue: z.core.$ZodIssue, basePath: readonly PropertyKey[]): string[] {
  const path = [...basePath, ...issue.path];
  if (issue.code === 'invalid_union' && issue.errors.length === CONDITION_BRANCH_KEYS.length) {
    const input: unknown = issue.input;
    const branch =
      typeof input === 'object' && input !== null
        ? CONDITION_BRANCH_KEYS.findIndex((key) => key in input)
        : -1;
    const branchIssues = issue.errors[branch];
    if (branchIssues !== undefined) {
      return branchIssues.flatMap((inner) => formatIssue(inner, path));
    }
    return [
      `${formatPath(path) || '(root)'}: Condition must be a leaf { field, operator, ... } or a combinator { all | any | not }`,
    ];
  }
  return [`${formatPath(path) || '(root)'}: ${issue.message}`];
}
