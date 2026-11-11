import { KnowledgeBaseError, loadKnowledgeBase } from '../src/kb/kb-loader';
import { knowledgeBaseSchema } from '../src/kb/kb.schema';
import { loadFixtureKb, loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

describe('real KB (kb/risk-kb.json)', () => {
  // Deliberately not pinned to a factor count or version: adding a factor must not break this test.
  it('passes validation', () => {
    const kb = loadRealKb();
    expect(kb.schemaVersion).toBe(1);
    expect(kb.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(kb.factors.length).toBeGreaterThan(0);
  });

  it('is cached per process until the cache is reset', () => {
    const first = loadRealKb();
    expect(loadKnowledgeBase()).toBe(first);
  });
});

describe('fixture KBs', () => {
  it('accepts a small valid KB', () => {
    expect(loadFixtureKb('valid-minimal').factors).toHaveLength(2);
  });

  it.each([
    ['duplicate-id', /factors\[1\]\.id: Duplicate factor id "young" \(first used at factors\[0\]\)/],
    ['unknown-operator', /factors\[0\]\.condition\.operator: Unknown operator "greater"\. Expected one of: eq, neq/],
    ['unknown-field', /factors\[2\]\.condition\.all\[1\]\.field: Invalid option: expected one of .*"postcode"/],
    ['overlapping-bands', /riskBands\.HIGH\.min: Band "HIGH" \(5–99\) overlaps band "LOW" \(0–9\); expected min 10/],
    ['per-occurrence-compound', /factors\[1\]\.perOccurrence: Factor "claims": perOccurrence is only allowed on a leaf condition/],
  ])('rejects %s with a clear message', (fixture, message) => {
    expect(() => loadFixtureKb(fixture)).toThrow(KnowledgeBaseError);
    expect(() => loadFixtureKb(fixture)).toThrow(message);
  });

  it('reports exactly one issue per defect, not every union branch', () => {
    try {
      loadFixtureKb('unknown-field');
      throw new Error('expected the fixture to be rejected');
    } catch (error) {
      if (!(error instanceof KnowledgeBaseError)) throw error;
      expect(error.issues).toHaveLength(1);
    }
  });
});

describe('cross-checks', () => {
  const realKb = () => structuredClone(loadRealKb());

  it('rejects an unsupported schemaVersion', () => {
    const result = knowledgeBaseSchema.safeParse({ ...realKb(), schemaVersion: 2 });
    expect(result.error?.issues.map((i) => i.message)).toContain('Unsupported schemaVersion 2. Supported: 1');
  });

  it('rejects a gap between bands', () => {
    const kb = realKb();
    const elevated = kb.riskBands['ELEVATED'];
    if (elevated === undefined) throw new Error('real KB has no ELEVATED band');
    elevated.min += 1;
    const messages = knowledgeBaseSchema.safeParse(kb).error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => m.includes('leaves a gap after'))).toBe(true);
  });

  it('rejects bands that do not start at 0', () => {
    const kb = realKb();
    const standard = kb.riskBands['STANDARD'];
    if (standard === undefined) throw new Error('real KB has no STANDARD band');
    standard.min = 1;
    const messages = knowledgeBaseSchema.safeParse(kb).error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => m.includes('must start at 0'))).toBe(true);
  });

  it('rejects a leaf with a key its operator does not use', () => {
    const result = knowledgeBaseSchema.safeParse({
      ...realKb(),
      factors: [{ id: 'x', description: 'x', points: 1, condition: { field: 'age', operator: 'gt', value: 1, values: [2] } }],
    });
    expect(result.success).toBe(false);
  });
});
