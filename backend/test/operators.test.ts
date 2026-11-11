import { evaluateCondition, toConditionInput } from '../src/engine/evaluate-condition';
import { applyOperator, operators } from '../src/engine/operators';
import { OPERATOR_NAMES, type Condition, type LeafCondition } from '../src/kb/kb.schema';
import type { QuoteRequest } from '../src/validation/quote-request.schema';

type Row = [label: string, condition: LeafCondition, actual: unknown, expected: boolean];

const rows: Row[] = [
  ['eq match', { field: 'propertyType', operator: 'eq', value: 'Flat' }, 'Flat', true],
  ['eq different value', { field: 'propertyType', operator: 'eq', value: 'Flat' }, 'House', false],
  ['eq is case-sensitive', { field: 'propertyType', operator: 'eq', value: 'Flat' }, 'flat', false],
  ['eq does not coerce', { field: 'age', operator: 'eq', value: 40 }, '40', false],
  ['neq different value', { field: 'propertyType', operator: 'neq', value: 'Flat' }, 'House', true],
  ['neq same value', { field: 'propertyType', operator: 'neq', value: 'Flat' }, 'Flat', false],
  ['in listed', { field: 'propertyType', operator: 'in', values: ['Flat', 'Bungalow'] }, 'Bungalow', true],
  ['in not listed', { field: 'propertyType', operator: 'in', values: ['Flat', 'Bungalow'] }, 'House', false],
  ['not_in not listed', { field: 'propertyType', operator: 'not_in', values: ['Flat'] }, 'House', true],
  ['not_in listed', { field: 'propertyType', operator: 'not_in', values: ['Flat'] }, 'Flat', false],
  ['gt above', { field: 'propertyValue', operator: 'gt', value: 750000 }, 750001, true],
  ['gt at value', { field: 'propertyValue', operator: 'gt', value: 750000 }, 750000, false],
  ['gte at value', { field: 'previousClaims', operator: 'gte', value: 3 }, 3, true],
  ['gte below', { field: 'previousClaims', operator: 'gte', value: 3 }, 2, false],
  ['lt below', { field: 'age', operator: 'lt', value: 25 }, 24, true],
  ['lt at value', { field: 'age', operator: 'lt', value: 25 }, 25, false],
  ['lte at value', { field: 'age', operator: 'lte', value: 25 }, 25, true],
  ['lte above', { field: 'age', operator: 'lte', value: 25 }, 26, false],
  ['between at min', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 1, true],
  ['between at max', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 2, true],
  ['between below min', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 0, false],
  ['between above max', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 3, false],
  ['outside_range at exactly 25', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 25, false],
  ['outside_range at exactly 75', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 75, false],
  ['outside_range below min', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 24, true],
  ['outside_range above max', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 76, true],
  ['starts_with match', { field: 'postcode', operator: 'starts_with', values: ['EX', 'PL'] }, 'PL1 1AA', true],
  ['starts_with lowercase input', { field: 'postcode', operator: 'starts_with', values: ['EX'] }, 'ex4 1aa', true],
  ['starts_with lowercase prefix', { field: 'postcode', operator: 'starts_with', values: ['ex'] }, 'EX4 1AA', true],
  ['starts_with no match', { field: 'postcode', operator: 'starts_with', values: ['EX', 'PL'] }, 'SW1A 1AA', false],
  ['starts_with non-string', { field: 'postcode', operator: 'starts_with', values: ['4'] }, 40, false],
];

const numericOperatorRows: Row[] = [
  ['gt', { field: 'age', operator: 'gt', value: 1 }, '40', false],
  ['gte', { field: 'age', operator: 'gte', value: 1 }, '40', false],
  ['lt', { field: 'age', operator: 'lt', value: 100 }, '40', false],
  ['lte', { field: 'age', operator: 'lte', value: 100 }, '40', false],
  ['between', { field: 'age', operator: 'between', min: 1, max: 100 }, '40', false],
  ['outside_range', { field: 'age', operator: 'outside_range', min: 50, max: 100 }, '40', false],
  ['gt with NaN', { field: 'age', operator: 'gt', value: 1 }, Number.NaN, false],
  ['outside_range with undefined', { field: 'age', operator: 'outside_range', min: 50, max: 100 }, undefined, false],
];

describe('operator registry', () => {
  it('implements every operator in the KB schema', () => {
    expect(Object.keys(operators).sort()).toEqual([...OPERATOR_NAMES].sort());
  });

  it.each(rows)('%s', (_label, condition, actual, expected) => {
    expect(applyOperator(condition, actual)).toBe(expected);
  });

  it.each(numericOperatorRows)('%s is false for a non-number (no coercion)', (_label, condition, actual, expected) => {
    expect(applyOperator(condition, actual)).toBe(expected);
  });
});

describe('evaluateCondition', () => {
  const input: QuoteRequest = {
    customerName: 'Jane Doe',
    age: 40,
    propertyType: 'Flat',
    propertyValue: 600000,
    postcode: 'EX4 1AA',
    previousClaims: 0,
  };
  const isFlat: Condition = { field: 'propertyType', operator: 'eq', value: 'Flat' };
  const isHouse: Condition = { field: 'propertyType', operator: 'eq', value: 'House' };
  const highValue: Condition = { field: 'propertyValue', operator: 'gt', value: 500000 };

  const conditionInput = toConditionInput(input);

  it.each<[string, Condition, boolean]>([
    ['leaf true', isFlat, true],
    ['leaf false', isHouse, false],
    ['all, every child true', { all: [isFlat, highValue] }, true],
    ['all, one child false', { all: [isFlat, isHouse] }, false],
    ['any, one child true', { any: [isHouse, highValue] }, true],
    ['any, no child true', { any: [isHouse, { not: highValue }] }, false],
    ['not negates', { not: isHouse }, true],
    ['nested: not(any(house, all(flat, not(high value))))', { not: { any: [isHouse, { all: [isFlat, { not: highValue }] }] } }, true],
    ['nested: all(any(house, flat), not(not(high value)))', { all: [{ any: [isHouse, isFlat] }, { not: { not: highValue } }] }, true],
  ])('%s', (_label, condition, expected) => {
    expect(evaluateCondition(condition, conditionInput)).toBe(expected);
  });
});
