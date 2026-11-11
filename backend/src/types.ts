import type { QuoteRequest } from './validation/quote-request.schema';

/** A KB factor that applied to this quote. */
export interface AppliedFactor {
  id: string;
  /** Customer-facing, straight from the KB. */
  description: string;
  points: number;
}

export interface CoverageDetails {
  propertyType: QuoteRequest['propertyType'];
  propertyValue: number;
  basePremium: number;
  coverageLoadFactor: number;
  /** The risk band's multiplier. */
  riskMultiplier: number;
}

/** The quote returned to the customer. */
export interface QuoteResult {
  monthlyPremium: number;
  annualPremium: number;
  /** A key of the KB's `riskBands`. */
  riskBand: string;
  riskScore: number;
  riskSummary: string;
  coverageDetails: CoverageDetails;
  appliedFactors: AppliedFactor[];
  /** The KB `version` that produced this quote, for audit. */
  kbVersion: string;
}
