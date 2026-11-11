import type { Condition } from '../kb/kb.schema';
import { derivePostcodeFields } from '../validation/postcode';
import type { ConditionField, QuoteRequest } from '../validation/quote-request.schema';
import { applyOperator } from './operators';

/** The values a condition can read: the request fields plus the derived postcode fields. */
export type ConditionInput = Readonly<Record<ConditionField, unknown>>;

/** The one place a request becomes engine input: the request plus its derived postcode fields. */
export function toConditionInput(request: QuoteRequest): ConditionInput {
  return { ...request, ...derivePostcodeFields(request.postcode) };
}

/** Recursively evaluates a KB condition: all → every, any → some, not → negate, leaf → operator. */
export function evaluateCondition(condition: Condition, input: ConditionInput): boolean {
  if ('all' in condition) return condition.all.every((child) => evaluateCondition(child, input));
  if ('any' in condition) return condition.any.some((child) => evaluateCondition(child, input));
  if ('not' in condition) return !evaluateCondition(condition.not, input);
  return applyOperator(condition, input[condition.field]);
}
