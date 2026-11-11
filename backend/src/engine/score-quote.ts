import type { Factor, KnowledgeBase, RiskBand } from '../kb/kb.schema';
import type { AppliedFactor, QuoteResult } from '../types';
import type { QuoteRequest } from '../validation/quote-request.schema';
import { evaluateCondition, toConditionInput, type ConditionInput } from './evaluate-condition';

const NO_FACTORS_TEXT = 'No additional risk factors.';
const MONTHS_PER_YEAR = 12;

/** The single place money is rounded: to 2 decimal places (pence). */
export function roundToPence(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export interface ResolvedBand {
  name: string;
  band: RiskBand;
}

/**
 * The band where min ≤ score ≤ max. A score above the top band's max goes in the top band
 * (the band with the highest min). The KB schema guarantees bands start at 0 with no gaps.
 */
export function resolveBand(riskScore: number, kb: KnowledgeBase): ResolvedBand {
  const bands = Object.entries(kb.riskBands).map(([name, band]) => ({ name, band }));
  const match = bands.find(({ band }) => riskScore >= band.min && riskScore <= band.max);
  if (match !== undefined) return match;

  const top = bands.reduce<ResolvedBand | undefined>(
    (highest, candidate) => (highest === undefined || candidate.band.min > highest.band.min ? candidate : highest),
    undefined,
  );
  if (top !== undefined && riskScore > top.band.max) return top;
  throw new Error(`No risk band covers score ${riskScore}`);
}

/** Points for an applied factor: fixed, or points × the field's value when perOccurrence is set. */
function pointsFor(factor: Factor, input: ConditionInput): number {
  if (factor.perOccurrence !== true) return factor.points;

  const { condition } = factor;
  if (!('field' in condition)) {
    throw new Error(`Factor "${factor.id}": perOccurrence needs a leaf condition`);
  }
  const occurrences = input[condition.field];
  if (typeof occurrences !== 'number') {
    throw new Error(
      `Factor "${factor.id}": perOccurrence needs a numeric field, but "${condition.field}" is ${typeof occurrences}`,
    );
  }
  return factor.points * occurrences;
}

function buildRiskSummary(bandSummary: string, appliedFactors: readonly AppliedFactor[]): string {
  if (appliedFactors.length === 0) return `${bandSummary} ${NO_FACTORS_TEXT}`;
  const descriptions = appliedFactors.map((factor) => factor.description).join('; ');
  return `${bandSummary} Factors: ${descriptions}.`;
}

export interface RiskAssessment {
  appliedFactors: AppliedFactor[];
  riskScore: number;
}

/** The factors that apply (in KB order) and the resulting score. Shared by scoreQuote and the KB linter. */
export function assessRisk(input: ConditionInput, kb: KnowledgeBase): RiskAssessment {
  const appliedFactors: AppliedFactor[] = kb.factors
    .filter((factor) => evaluateCondition(factor.condition, input))
    .map((factor) => ({ id: factor.id, description: factor.description, points: pointsFor(factor, input) }));
  return { appliedFactors, riskScore: appliedFactors.reduce((sum, factor) => sum + factor.points, 0) };
}

/** Pure scoring and pricing. Every number, band and rule comes from the KB. */
export function scoreQuote(input: QuoteRequest, kb: KnowledgeBase): QuoteResult {
  const { appliedFactors, riskScore } = assessRisk(toConditionInput(input), kb);
  const { name: riskBand, band } = resolveBand(riskScore, kb);

  const annualPremium = roundToPence(kb.basePremium * band.multiplier * kb.coverageLoadFactor);
  const monthlyPremium = roundToPence(annualPremium / MONTHS_PER_YEAR);

  return {
    monthlyPremium,
    annualPremium,
    riskBand,
    riskScore,
    riskSummary: buildRiskSummary(band.summary, appliedFactors),
    coverageDetails: {
      propertyType: input.propertyType,
      propertyValue: input.propertyValue,
      basePremium: kb.basePremium,
      coverageLoadFactor: kb.coverageLoadFactor,
      riskMultiplier: band.multiplier,
    },
    appliedFactors,
    kbVersion: kb.version,
  };
}
