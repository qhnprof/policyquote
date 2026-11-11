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

  it('shows premiums in GBP, the badge, score, summary and KB version', async () => {
    await render(quote);
    expect(element.querySelector('.premium-amount')?.textContent).toBe('£45.00');
    expect(element.querySelector('.premium-annual')?.textContent).toContain('£540.00');
    expect(element.querySelector('app-risk-band-badge')?.textContent).toContain('ELEVATED');
    expect(element.querySelector('.score dd')?.textContent).toBe('30');
    expect(element.querySelector('.summary')?.textContent).toBe(quote.riskSummary);
    expect(element.querySelector('.kb-version')?.textContent).toContain('1.1.0');
  });

  it('lists each applied factor with its points', async () => {
    await render(quote);
    const items = Array.from(element.querySelectorAll('.factor'), (item) => [
      item.querySelector('.factor-description')?.textContent,
      item.querySelector('.factor-points')?.textContent,
    ]);
    expect(items).toEqual([
      ['Under 25 or over 75 — higher risk profile', '+20 pts'],
      ['Flat — higher shared risk', '+10 pts'],
    ]);
  });

  it('says so when no factors apply', async () => {
    await render({ ...quote, appliedFactors: [] });
    expect(element.querySelector('.factors')).toBeNull();
    expect(element.querySelector('.no-factors')?.textContent).toBe('No risk factors applied');
  });
});
