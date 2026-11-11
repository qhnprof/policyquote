// Mirrors backend/src/validation/quote-request.schema.ts and backend/src/types.ts.
// Keep these in step with the backend: the API contract is defined there.

export const PROPERTY_TYPES = ['House', 'Flat', 'Bungalow'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export interface QuoteRequest {
  customerName: string;
  age: number;
  propertyType: PropertyType;
  propertyValue: number;
  postcode: string;
  previousClaims: number;
}

export interface AppliedFactor {
  id: string;
  /** Customer-facing text from the KB. */
  description: string;
  points: number;
}

export interface CoverageDetails {
  propertyType: PropertyType;
  propertyValue: number;
  basePremium: number;
  coverageLoadFactor: number;
  riskMultiplier: number;
}

export interface QuoteResponse {
  monthlyPremium: number;
  annualPremium: number;
  /** A band name from the KB. A string, not a union, so a new KB band needs no frontend change. */
  riskBand: string;
  riskScore: number;
  riskSummary: string;
  coverageDetails: CoverageDetails;
  appliedFactors: AppliedFactor[];
  kbVersion: string;
}

/** Body of a 400 VALIDATION_ERROR response. */
export interface ValidationErrorResponse {
  error: 'VALIDATION_ERROR';
  issues: { path: string; message: string }[];
}
