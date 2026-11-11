import type { Condition } from '../kb/kb.schema';
import type { QuoteRequestField } from '../validation/quote-request.schema';
import { applyOperator } from './operators';

/** The request values a condition can read. A validated QuoteRequest satisfies this. */
export type ConditionInput = Readonly<Record<QuoteRequestField, unknown>>;

/** Recursively evaluates a KB condition: all → every, any → some, not → negate, leaf → operator. */
export function evaluateCondition(condition: Condition, input: ConditionInput): boolean {
  if ('all' in condition) return condition.all.every((child) => evaluateCondition(child, input));
  if ('any' in condition) return condition.any.some((child) => evaluateCondition(child, input));
  if ('not' in condition) return !evaluateCondition(condition.not, input);
  return applyOperator(condition, input[condition.field]);
}
