import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { QuoteResponse } from '../../models/quote.models';
import { QuoteResultComponent } from './quote-result.component';

const quote: QuoteResponse = {
  monthlyPremium: 45,
  annualPremium: 540,
  riskBand: 'ELEVATED',
  riskScore: 30,
  riskSummary: 'Some of your details raise the risk above our standard range. Factors: Flat — higher shared risk.',
  coverageDetails: {
    propertyType: 'Flat',
    propertyValue: 250000,
    basePremium: 300,
    coverageLoadFactor: 1.2,
    riskMultiplier: 1.5,
  },
  appliedFactors: [
    { id: 'age_young_elderly', description: 'Under 25 or over 75 — higher risk profile', points: 20 },
    { id: 'property_type_flat', description: 'Flat — higher shared risk', points: 10 },
  ],
  kbVersion: '1.1.0',
};

describe('QuoteResultComponent', () => {
  let fixture: ComponentFixture<QuoteResultComponent>;
  let element: HTMLElement;

  async function render(value: QuoteResponse): Promise<void> {
    fixture.componentRef.setInput('quote', value);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [QuoteResultComponent] }).compileComponents();
    fixture = TestBed.createComponent(QuoteResultComponent);
    element = fixture.nativeElement;
  });

  it('renders the quote it is given', async () => {
    await render(quote);
    expect(element.textContent).toContain('ELEVATED');
  });
});
