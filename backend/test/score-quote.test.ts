import { resolveBand, roundToPence, scoreQuote } from '../src/engine/score-quote';
import type { KnowledgeBase } from '../src/kb/kb.schema';
import type { QuoteRequest } from '../src/validation/quote-request.schema';
import { loadFixtureKb, loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

const request = (overrides: Partial<QuoteRequest>): QuoteRequest => ({
  customerName: 'Jane Doe',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'SW1A 1AA',
  previousClaims: 0,
  ...overrides,
});

describe('scoreQuote with the real KB', () => {
  // Expected values were checked by hand against kb/risk-kb.json. If a row fails, fix the code.
  it.each<[string, number, QuoteRequest['propertyType'], number, number, number, string, number, number]>([
    ['standard', 40, 'House', 300000, 0, 0, 'STANDARD', 360, 30],
    ['standard boundary', 40, 'House', 800000, 0, 25, 'STANDARD', 360, 30],
    ['elevated', 22, 'Flat', 250000, 0, 30, 'ELEVATED', 540, 45],
    ['elevated boundary', 22, 'Flat', 250000, 2, 60, 'ELEVATED', 540, 45],
    ['compound', 40, 'Flat', 600000, 0, 45, 'ELEVATED', 540, 45],
    ['high risk', 40, 'House', 800000, 3, 115, 'HIGH_RISK', 792, 66],
  ])('%s', (_case, age, propertyType, propertyValue, previousClaims, score, band, annual, monthly) => {
    const result = scoreQuote(request({ age, propertyType, propertyValue, previousClaims }), loadRealKb());
    expect(result).toMatchObject({
      riskScore: score,
      riskBand: band,
      annualPremium: annual,
      monthlyPremium: monthly,
    });
  });

  it('lists applied factors in KB order, with per-occurrence points', () => {
    const result = scoreQuote(request({ previousClaims: 3, propertyValue: 800000 }), loadRealKb());
    expect(result.appliedFactors).toEqual([
      { id: 'previous_claims_high', description: '3 or more previous claims', points: 90 },
      { id: 'property_value_high', description: 'Property value over £750,000', points: 25 },
    ]);
  });

  it('applies the compound factor only when both parts hold', () => {
    const ids = (overrides: Partial<QuoteRequest>) =>
      scoreQuote(request(overrides), loadRealKb()).appliedFactors.map((f) => f.id);
    expect(ids({ propertyType: 'Flat', propertyValue: 600000 })).toEqual(['property_type_flat', 'flat_high_value']);
    expect(ids({ propertyType: 'Flat', propertyValue: 500000 })).toEqual(['property_type_flat']);
    expect(ids({ propertyType: 'House', propertyValue: 600000 })).toEqual([]);
  });

  it('builds the risk summary from the band summary and factor descriptions', () => {
    const kb = loadRealKb();
    expect(scoreQuote(request({}), kb).riskSummary).toBe(
      `${kb.riskBands['STANDARD']?.summary} No additional risk factors.`,
    );
    expect(scoreQuote(request({ age: 22, propertyType: 'Flat', propertyValue: 250000 }), kb).riskSummary).toBe(
      `${kb.riskBands['ELEVATED']?.summary} Factors: Under 25 or over 75 — higher risk profile; Flat — higher shared risk.`,
    );
  });

  it('returns coverage details and the KB version', () => {
    const kb = loadRealKb();
    const result = scoreQuote(request({ propertyType: 'Flat', propertyValue: 600000 }), kb);
    expect(result.coverageDetails).toEqual({
      propertyType: 'Flat',
      propertyValue: 600000,
      basePremium: kb.basePremium,
      coverageLoadFactor: kb.coverageLoadFactor,
      riskMultiplier: kb.riskBands['ELEVATED']?.multiplier,
    });
    expect(result.kbVersion).toBe(kb.version);
  });
});

describe('resolveBand', () => {
  it.each([
    [0, 'STANDARD'],
    [25, 'STANDARD'],
    [26, 'ELEVATED'],
    [60, 'ELEVATED'],
    [61, 'HIGH_RISK'],
    [999, 'HIGH_RISK'],
    [1000, 'HIGH_RISK'],
  ])('score %p → %s', (score, band) => {
    expect(resolveBand(score, loadRealKb()).name).toBe(band);
  });

  it('throws for a score no band covers', () => {
    expect(() => resolveBand(-1, loadRealKb())).toThrow('No risk band covers score -1');
  });
});

describe('KB-only change', () => {
  it('applies a factor that exists only in the KB file, with no code change', () => {
    const input = request({ postcode: 'TR1 1AA' });
    expect(scoreQuote(input, loadRealKb()).riskScore).toBe(0);

    const result = scoreQuote(input, loadFixtureKb('kb-with-extra-factor'));
    expect(result.appliedFactors).toEqual([
      { id: 'coastal_postcode', description: 'Coastal postcode area — higher storm exposure', points: 10 },
    ]);
    expect(result).toMatchObject({ riskScore: 10, riskBand: 'STANDARD', kbVersion: '1.2.0' });
  });
});

describe('perOccurrence and rounding', () => {
  it('throws when a perOccurrence field is not a number', () => {
    const kb: KnowledgeBase = structuredClone(loadRealKb());
    kb.factors.push({
      id: 'per_postcode',
      description: 'x',
      condition: { field: 'postcode', operator: 'starts_with', values: ['SW'] },
      points: 1,
      perOccurrence: true,
    });
    expect(() => scoreQuote(request({}), kb)).toThrow(
      'Factor "per_postcode": perOccurrence needs a numeric field, but "postcode" is string',
    );
  });

  it.each([
    [1.005, 1.01],
    [0.1 + 0.2, 0.3],
    [359.988, 359.99],
    [29.999166, 30],
  ])('roundToPence(%p) → %p', (amount, expected) => {
    expect(roundToPence(amount)).toBe(expected);
  });

  it('rounds annual and monthly premiums to pence', () => {
    const kb: KnowledgeBase = { ...structuredClone(loadRealKb()), basePremium: 299.99 };
    expect(scoreQuote(request({}), kb)).toMatchObject({ annualPremium: 359.99, monthlyPremium: 30 });
  });
});
