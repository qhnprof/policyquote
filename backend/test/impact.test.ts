import { compareKnowledgeBases, diffFactors, hasNoDifferences } from '../src/analysis/impact';
import { createRandom, generateBook, loadBookAssumptions } from '../src/analysis/synthetic-book';
import { scoreQuote } from '../src/engine/score-quote';
import type { KnowledgeBase } from '../src/kb/kb.schema';
import { quoteRequestSchema } from '../src/validation/quote-request.schema';
import { loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

const isExOrPl = (postcode: string) => /^(EX|PL)/.test(postcode);

function withExPlRule(kb: KnowledgeBase): KnowledgeBase {
  const candidate = structuredClone(kb);
  candidate.factors.push({
    id: 'test_ex_pl_postcode',
    description: 'Test rule: EX or PL postcode',
    condition: { field: 'postcode', operator: 'starts_with', values: ['EX', 'PL'] },
    points: 15,
  });
  return candidate;
}

describe('synthetic book', () => {
  it('is the same for the same seed, and different for another seed', () => {
    expect(generateBook(200, 42)).toEqual(generateBook(200, 42));
    expect(generateBook(200, 42)).not.toEqual(generateBook(200, 7));
  });

  it('contains only valid quote requests', () => {
    for (const customer of generateBook(1000, 42)) {
      expect(quoteRequestSchema.safeParse(customer).success).toBe(true);
    }
  });

  it('roughly follows the assumed property mix and includes EX/PL postcodes', () => {
    const book = generateBook(1000, 42);
    const share = (type: string) => book.filter((c) => c.propertyType === type).length / book.length;
    expect(share('House')).toBeCloseTo(0.55, 1);
    expect(share('Flat')).toBeCloseTo(0.3, 1);
    expect(share('Bungalow')).toBeCloseTo(0.15, 1);
    expect(book.some((c) => isExOrPl(c.postcode))).toBe(true);
    expect(book.some((c) => c.propertyValue > 750000)).toBe(true);
  });

  it('loads valid assumptions and a deterministic random stream', () => {
    expect(loadBookAssumptions().postcodeDistricts.length).toBeGreaterThan(0);
    const a = createRandom(1);
    const b = createRandom(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('compareKnowledgeBases', () => {
  it('shows zero change when a KB is compared with itself', () => {
    const kb = loadRealKb();
    const report = compareKnowledgeBases(kb, kb, generateBook(500, 42));
    expect(report.movedUp.count).toBe(0);
    expect(report.movedDown.count).toBe(0);
    expect(report.unchanged.count).toBe(500);
    expect(report.premium.totalChange).toBe(0);
    expect(report.biggestMovers).toEqual([]);
    expect(report.bandTransitions.every((t) => t.from === t.to)).toBe(true);
    expect(hasNoDifferences(report)).toBe(true);
  });

  it('a +15 EX/PL rule only affects customers with those postcodes', () => {
    const base = loadRealKb();
    const candidate = withExPlRule(base);
    const book = generateBook(1000, 42);

    for (const customer of book) {
      const delta = scoreQuote(customer, candidate).riskScore - scoreQuote(customer, base).riskScore;
      expect(delta).toBe(isExOrPl(customer.postcode) ? 15 : 0);
    }

    const report = compareKnowledgeBases(base, candidate, book);
    expect(report.factorDiff.added).toEqual(['test_ex_pl_postcode']);
    expect(report.movedDown.count).toBe(0);
    expect(report.movedUp.count).toBeGreaterThan(0);
    expect(report.premium.totalChange).toBeGreaterThan(0);
    expect(report.biggestMovers.length).toBeGreaterThan(0);
    expect(report.biggestMovers.every((m) => isExOrPl(m.customer.postcode))).toBe(true);
    expect(hasNoDifferences(report)).toBe(false);
  });

  it('counts a points increase as moving customers up, with matching premium totals', () => {
    const base = loadRealKb();
    const candidate = structuredClone(base);
    const claimsLow = candidate.factors.find((f) => f.id === 'previous_claims_low');
    if (claimsLow === undefined) throw new Error('real KB has no previous_claims_low');
    claimsLow.points = 20;

    const report = compareKnowledgeBases(base, candidate, generateBook(1000, 42));
    expect(report.factorDiff.pointsChanged).toEqual([{ id: 'previous_claims_low', from: 15, to: 20 }]);
    expect(report.movedUp.count).toBeGreaterThan(0);
    expect(report.movedDown.count).toBe(0);
    expect(report.premium.totalAfter - report.premium.totalBefore).toBeCloseTo(report.premium.totalChange, 2);
    expect(report.biggestMovers.length).toBeLessThanOrEqual(5);
  });
});

describe('diffFactors', () => {
  it('reports added, removed, points, condition and other changes by id', () => {
    const base = loadRealKb().factors;
    const candidate = structuredClone(base)
      .filter((f) => f.id !== 'property_type_flat')
      .map((f) => {
        if (f.id === 'age_young_elderly') return { ...f, points: 25 };
        if (f.id === 'property_value_high') return { ...f, condition: { field: 'propertyValue' as const, operator: 'gt' as const, value: 1000000 } };
        if (f.id === 'previous_claims_high') return { ...f, description: 'Three or more claims' };
        return f;
      });
    candidate.push({ id: 'new_rule', description: 'x', condition: { field: 'age', operator: 'gt', value: 90 }, points: 5 });

    expect(diffFactors(base, candidate)).toEqual({
      added: ['new_rule'],
      removed: ['property_type_flat'],
      pointsChanged: [{ id: 'age_young_elderly', from: 20, to: 25 }],
      conditionChanged: ['property_value_high'],
      otherChanged: ['previous_claims_high'],
    });
  });
});
