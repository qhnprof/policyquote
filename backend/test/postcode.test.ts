import { scoreQuote } from '../src/engine/score-quote';
import { evaluateCondition, toConditionInput } from '../src/engine/evaluate-condition';
import { lintKnowledgeBase } from '../src/kb/lint-kb';
import { knowledgeBaseSchema, type Condition, type KnowledgeBase } from '../src/kb/kb.schema';
import { derivePostcodeFields } from '../src/validation/postcode';
import { quoteRequestSchema, type QuoteRequest } from '../src/validation/quote-request.schema';
import { loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

const request = (postcode: string): QuoteRequest =>
  quoteRequestSchema.parse({ customerName: 'Jane Doe', age: 40, propertyType: 'House', propertyValue: 300000, postcode, previousClaims: 0 });

describe('derivePostcodeFields', () => {
  it.each([
    ['E1 6AN', 'E', 'E1'],
    ['EX4 1AA', 'EX', 'EX4'],
    ['SW1A 1AA', 'SW', 'SW1A'],
    ['M1 1AE', 'M', 'M1'],
    ['ex41aa', 'EX', 'EX4'],
  ])('%s → area %s, district %s', (postcode, postcodeArea, postcodeDistrict) => {
    expect(derivePostcodeFields(postcode)).toEqual({ postcodeArea, postcodeDistrict });
  });

  it('"B1 1AA" and "B10 0AA" are different districts in the same area', () => {
    expect(derivePostcodeFields('B1 1AA')).toEqual({ postcodeArea: 'B', postcodeDistrict: 'B1' });
    expect(derivePostcodeFields('B10 0AA')).toEqual({ postcodeArea: 'B', postcodeDistrict: 'B10' });
  });
});

describe('rules on derived postcode fields', () => {
  const areaE: Condition = { field: 'postcodeArea', operator: 'in', values: ['E'] };
  const districtB1: Condition = { field: 'postcodeDistrict', operator: 'in', values: ['B1'] };

  it('postcodeArea in ["E"] matches "E1 6AN" but not "EX4 1AA" (no prefix trap)', () => {
    expect(evaluateCondition(areaE, toConditionInput(request('E1 6AN')))).toBe(true);
    expect(evaluateCondition(areaE, toConditionInput(request('EX4 1AA')))).toBe(false);
    // The prefix rule this replaces would match both:
    const prefixE: Condition = { field: 'postcode', operator: 'starts_with', values: ['E'] };
    expect(evaluateCondition(prefixE, toConditionInput(request('EX4 1AA')))).toBe(true);
  });

  it('postcodeDistrict in ["B1"] matches "B1 1AA" but not "B10 0AA"', () => {
    expect(evaluateCondition(districtB1, toConditionInput(request('B1 1AA')))).toBe(true);
    expect(evaluateCondition(districtB1, toConditionInput(request('B10 0AA')))).toBe(false);
  });

  it('scoreQuote derives the fields, so a KB rule on a district applies end to end', () => {
    const kb: KnowledgeBase = structuredClone(loadRealKb());
    kb.factors.push({ id: 'district_ex4', description: 'EX4 district', condition: { field: 'postcodeDistrict', operator: 'in', values: ['EX4'] }, points: 15 });
    expect(knowledgeBaseSchema.safeParse(kb).success).toBe(true);
    expect(scoreQuote(request('ex4 1aa'), kb).appliedFactors.map((f) => f.id)).toEqual(['district_ex4']);
    expect(scoreQuote(request('EX44 1AA'), kb).appliedFactors).toEqual([]);
  });

  it('the KB schema accepts derived fields but still rejects unknown ones', () => {
    const base = loadRealKb();
    const withField = (field: string) => ({
      ...base,
      factors: [{ id: 'x', description: 'x', points: 1, condition: { field, operator: 'in', values: ['EX'] } }],
    });
    expect(knowledgeBaseSchema.safeParse(withField('postcodeArea')).success).toBe(true);
    expect(knowledgeBaseSchema.safeParse(withField('postcodeSector')).success).toBe(false);
  });

  it('the linter probes derived fields through the postcode, so district rules are live and disjoint', () => {
    const kb: KnowledgeBase = structuredClone(loadRealKb());
    kb.factors.push(
      { id: 'flood_b1', description: 'B1', condition: { field: 'postcodeDistrict', operator: 'in', values: ['B1'] }, points: 10, group: 'flood' },
      { id: 'flood_b10', description: 'B10', condition: { field: 'postcodeDistrict', operator: 'in', values: ['B10'] }, points: 25, group: 'flood' },
    );
    const findings = lintKnowledgeBase(kb);
    expect(findings.filter((f) => f.kind === 'dead-rule' || f.kind === 'overlap')).toEqual([]);
  });
});
