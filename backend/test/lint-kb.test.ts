import { lintKnowledgeBase, type LintFinding } from '../src/kb/lint-kb';
import { loadFixtureKb, loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

const ofKind = (findings: LintFinding[], kind: LintFinding['kind']) => findings.filter((f) => f.kind === kind);

describe('lintKnowledgeBase', () => {
  it('the real KB has no warnings and one stacking note', () => {
    const findings = lintKnowledgeBase(loadRealKb());
    expect(findings.filter((f) => f.level === 'warning')).toEqual([]);
    expect(findings).toEqual([
      expect.objectContaining({ level: 'info', kind: 'stacking', factorIds: ['flat_high_value', 'property_type_flat'] }),
    ]);
  });

  it('warns about an overlap at 3 claims (1–3 and ≥3 in one group)', () => {
    const overlaps = ofKind(lintKnowledgeBase(loadFixtureKb('lint-overlap')), 'overlap');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({
      level: 'warning',
      factorIds: ['claims_one_to_three', 'claims_three_plus'],
      message: expect.stringContaining('previousClaims = 3'),
    });
  });

  it('warns about a gap at 3 claims (1–2 and ≥4 in one group)', () => {
    const findings = lintKnowledgeBase(loadFixtureKb('lint-gap'));
    const gaps = ofKind(findings, 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.message).toContain('previousClaims = 3, between covered values 2 and 4');
    expect(ofKind(findings, 'overlap')).toEqual([]);
  });

  it('warns about a dead rule (age > 130 with ages limited to 18–120)', () => {
    const dead = ofKind(lintKnowledgeBase(loadFixtureKb('lint-dead-rule')), 'dead-rule');
    expect(dead).toEqual([
      expect.objectContaining({ level: 'warning', factorIds: ['very_old'], message: expect.stringContaining('age 18–120') }),
    ]);
  });

  it('warns about a band no input can reach', () => {
    const kb = structuredClone(loadRealKb());
    // Drop the per-claim factors and give every other factor 1 point: the highest possible score is
    // now 4, so ELEVATED (26–60) and HIGH_RISK (61–999) can never be reached.
    kb.factors = kb.factors.filter((f) => f.perOccurrence !== true).map((f) => ({ ...f, points: 1 }));
    const unreachable = ofKind(lintKnowledgeBase(kb), 'unreachable-band').map((f) => f.message);
    expect(unreachable).toEqual([
      expect.stringContaining('"ELEVATED"'),
      expect.stringContaining('"HIGH_RISK"'),
    ]);
  });

  it('never reports two factors of the same group as stacking', () => {
    const stacking = ofKind(lintKnowledgeBase(loadFixtureKb('lint-overlap')), 'stacking');
    expect(stacking.some((f) => f.factorIds.includes('claims_one_to_three') && f.factorIds.includes('claims_three_plus'))).toBe(false);
  });
});
