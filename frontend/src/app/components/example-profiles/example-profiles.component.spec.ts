import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EXAMPLE_PROFILES } from '../../data/example-profiles';
import type { QuoteRequest, QuoteResponse } from '../../models/quote.models';
import { ExampleProfilesComponent, type ProfileQuote } from './example-profiles.component';

function quote(riskBand: string, monthlyPremium: number): QuoteResponse {
  return {
    monthlyPremium,
    annualPremium: monthlyPremium * 12,
    riskBand,
    riskScore: 0,
    riskSummary: 'Summary.',
    coverageDetails: { propertyType: 'House', propertyValue: 1, basePremium: 300, coverageLoadFactor: 1.2, riskMultiplier: 1 },
    appliedFactors: [],
    kbVersion: 'test',
  };
}

/** What the API would answer for each persona (by name), or 'fail'. */
type Answers = Record<string, QuoteResponse | 'fail'>;

describe('ExampleProfilesComponent', () => {
  let fixture: ComponentFixture<ExampleProfilesComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  async function answer(answers: Answers): Promise<void> {
    for (const call of http.match('/policy/quote')) {
      const body: QuoteRequest = call.request.body;
      const reply = answers[body.customerName];
      if (reply === undefined || reply === 'fail') call.flush({}, { status: 500, statusText: 'Server Error' });
      else call.flush(reply);
    }
    await fixture.whenStable();
  }

  const cards = () => Array.from(element.querySelectorAll<HTMLButtonElement>('button.card'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExampleProfilesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ExampleProfilesComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('requests a live quote for every profile in parallel, showing placeholders meanwhile', () => {
    const pending = http.match('/policy/quote');
    expect(pending.map((call) => call.request.body.customerName)).toEqual(EXAMPLE_PROFILES.map((p) => p.request.customerName));
    expect(element.querySelectorAll('.card--loading')).toHaveLength(EXAMPLE_PROFILES.length);
    expect(cards()).toHaveLength(0);
    pending.forEach((call) => call.flush({}, { status: 500, statusText: 'x' }));
  });

  it('shows a card per quote, with the lowest monthly price in the headline', async () => {
    await answer({
      'Alex Morgan': quote('ELEVATED', 45),
      'Sam Patel': quote('STANDARD', 30),
      'Chris Lee': quote('HIGH_RISK', 66),
      'Jo Bennett': quote('STANDARD', 30),
    });
    expect(cards()).toHaveLength(4);
    expect(element.querySelector('.examples-title')?.textContent?.trim()).toBe('Home insurance from £30.00 a month');
    const first = cards()[0];
    expect(first?.querySelector('.card-label')?.textContent).toBe('First-time buyer');
    expect(first?.querySelector('.card-amount')?.textContent).toBe('£45.00');
    expect(first?.querySelector('app-risk-band-badge')?.textContent).toContain('ELEVATED');
  });

  it('hides a card whose request fails, instead of showing a broken price', async () => {
    await answer({
      'Alex Morgan': quote('ELEVATED', 45),
      'Sam Patel': 'fail',
      'Chris Lee': quote('HIGH_RISK', 66),
      'Jo Bennett': quote('STANDARD', 30),
    });
    expect(cards().map((card) => card.querySelector('.card-label')?.textContent)).toEqual([
      'First-time buyer',
      'City flat',
      'Coastal home',
    ]);
  });

  it('emits the profile and its quote when a card is clicked', async () => {
    const selected: ProfileQuote[] = [];
    fixture.componentInstance.profileSelected.subscribe((value) => selected.push(value));
    const cityFlat = quote('HIGH_RISK', 66);
    await answer({ 'Chris Lee': cityFlat });

    cards()[0]?.click();
    expect(selected).toHaveLength(1);
    expect(selected[0]?.profile.id).toBe('city-flat');
    expect(selected[0]?.quote).toEqual(cityFlat);
  });
});
