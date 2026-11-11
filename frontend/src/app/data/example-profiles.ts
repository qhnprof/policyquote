import type { QuoteRequest } from '../models/quote.models';

/**
 * Example customers shown at the top of the page. Inputs only, never prices: every price shown
 * for them comes live from the API, so it always matches the current KB.
 */
export interface ExampleProfile {
  id: string;
  /** Persona label on the card. */
  label: string;
  /** One line describing the customer. */
  description: string;
  request: QuoteRequest;
}

export const EXAMPLE_PROFILES: readonly ExampleProfile[] = [
  {
    id: 'first-time-buyer',
    label: 'First-time buyer',
    description: '24, flat in Manchester worth £250,000, no claims',
    request: { customerName: 'Alex Morgan', age: 24, propertyType: 'Flat', propertyValue: 250000, postcode: 'M1 1AE', previousClaims: 0 },
  },
  {
    id: 'family-home',
    label: 'Family home',
    description: '38, house in Leeds worth £450,000, no claims',
    request: { customerName: 'Sam Patel', age: 38, propertyType: 'House', propertyValue: 450000, postcode: 'LS6 2AB', previousClaims: 0 },
  },
  {
    id: 'city-flat',
    label: 'City flat',
    description: '35, flat in Chelsea worth £900,000, no claims',
    request: { customerName: 'Chris Lee', age: 35, propertyType: 'Flat', propertyValue: 900000, postcode: 'SW3 4AA', previousClaims: 0 },
  },
  {
    id: 'coastal-home',
    label: 'Coastal home',
    description: '45, house in Plymouth worth £380,000, 1 claim',
    request: { customerName: 'Jo Bennett', age: 45, propertyType: 'House', propertyValue: 380000, postcode: 'PL1 2AA', previousClaims: 1 },
  },
];
