import type { LeafCondition, OperatorName } from '../kb/kb.schema';

/** The leaf condition shape for one operator, e.g. LeafFor<'between'> has min and max. */
export type LeafFor<K extends OperatorName> = Extract<LeafCondition, { operator: K }>;

/** A pure predicate: does the request's field value satisfy this leaf condition? */
export type OperatorPredicate<K extends OperatorName> = (actual: unknown, condition: LeafFor<K>) => boolean;

/**
 * One predicate per operator in the KB schema. Because this is a mapped type over the operator
 * union, adding an operator to kb.schema.ts without implementing it here is a compile error.
 */
export type OperatorRegistry = { readonly [K in OperatorName]: OperatorPredicate<K> };

/** Numeric operators never coerce: "40" is not a number, and neither is NaN. */
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const operators: OperatorRegistry = {
  /** Strictly equal to `value`. */
  eq: (actual, { value }) => actual === value,
  /** Not strictly equal to `value`. */
  neq: (actual, { value }) => actual !== value,
  /** Strictly equal to at least one of `values`. */
  in: (actual, { values }) => values.some((candidate) => candidate === actual),
  /** Strictly equal to none of `values`. */
  not_in: (actual, { values }) => !values.some((candidate) => candidate === actual),
  /** A number greater than `value`. */
  gt: (actual, { value }) => isNumber(actual) && actual > value,
  /** A number greater than or equal to `value`. */
  gte: (actual, { value }) => isNumber(actual) && actual >= value,
  /** A number less than `value`. */
  lt: (actual, { value }) => isNumber(actual) && actual < value,
  /** A number less than or equal to `value`. */
  lte: (actual, { value }) => isNumber(actual) && actual <= value,
  /** A number from `min` to `max`, both inclusive. */
  between: (actual, { min, max }) => isNumber(actual) && actual >= min && actual <= max,
  /** A number below `min` or above `max` (min and max themselves are inside the range). */
  outside_range: (actual, { min, max }) => isNumber(actual) && (actual < min || actual > max),
  /** A string that starts with any of `values`, ignoring case. */
  starts_with: (actual, { values }) =>
    typeof actual === 'string' &&
    values.some((prefix) => actual.toUpperCase().startsWith(prefix.toUpperCase())),
};

/**
 * Typed dispatch helper. TypeScript can't correlate `operators[leaf.operator]` with `leaf` when
 * `leaf` is the whole LeafCondition union: it sees a union of predicates, each wanting a different
 * condition shape, and rejects the call. Making the operator a type parameter K ties the two
 * together: `operators[operator]` is then OperatorPredicate<K>, which accepts exactly LeafFor<K>.
 * No cast, no switch.
 */
function dispatch<K extends OperatorName>(operator: K, condition: LeafFor<K>, actual: unknown): boolean {
  const predicate: OperatorPredicate<K> = operators[operator];
  return predicate(actual, condition);
}

/** Applies a leaf condition's operator to the request's field value. */
export function applyOperator(condition: LeafCondition, actual: unknown): boolean {
  return dispatch(condition.operator, condition, actual);
}
