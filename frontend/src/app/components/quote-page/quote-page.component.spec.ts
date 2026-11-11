import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EXAMPLE_PROFILES } from '../../data/example-profiles';
import type { QuoteRequest, QuoteResponse } from '../../models/quote.models';
import { GENERIC_ERROR_MESSAGE } from '../../services/quote.service';
import { DRAFT_STORAGE_KEY, QuotePageComponent } from './quote-page.component';

const exampleNames = new Set(EXAMPLE_PROFILES.map((profile) => profile.request.customerName));

describe('QuotePageComponent', () => {
  let fixture: ComponentFixture<QuotePageComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  const query = <T extends Element>(selector: string): T => {
    const found = element.querySelector<T>(selector);
    if (found === null) throw new Error(`No element matches ${selector}`);
    return found;
  };
  const button = () => query<HTMLButtonElement>('button[type="submit"]');

  function type(id: string, value: string): void {
    const input = query<HTMLInputElement>(`#${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  async function fillValidForm(): Promise<void> {
    type('customerName', 'Jane Doe');
    type('age', '40');
    type('propertyValue', '300000');
    type('postcode', 'sw1a 1aa');
    type('previousClaims', '0');
    await fixture.whenStable();
  }

  /** The example cards request a quote per persona on load; answer them so they don't clash with form submits. */
  function answerExampleRequests(reply: (body: QuoteRequest) => QuoteResponse | null = () => null): void {
    for (const call of http.match((request) => request.url === '/policy/quote' && exampleNames.has(request.body?.customerName))) {
      const quote = reply(call.request.body);
      if (quote === null) call.flush({}, { status: 500, statusText: 'Server Error' });
      else call.flush(quote);
    }
  }

  async function create(exampleReply?: (body: QuoteRequest) => QuoteResponse | null): Promise<void> {
    fixture = TestBed.createComponent(QuotePageComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
    answerExampleRequests(exampleReply);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [QuotePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    await create();
  });

  afterEach(() => http.verify());

  it('disables the button until the form is valid', async () => {
    expect(button().disabled).toBe(true);
    await fillValidForm();
    expect(button().disabled).toBe(false);
    expect(button().textContent?.trim()).toBe('Get my quote');
  });

  it('shows a field error once a field is touched', async () => {
    type('age', '15');
    await fixture.whenStable();
    expect(query('#age-error').textContent).toContain('between 18 and 120');
    expect(button().disabled).toBe(true);
  });

  it('shows the loading label, then the quote', async () => {
    await fillValidForm();
    button().click();
    await fixture.whenStable();
    expect(button().textContent?.trim()).toBe('Getting your quote…');
    expect(button().disabled).toBe(true);

    const call = http.expectOne('/policy/quote');
    expect(call.request.body).toMatchObject({ customerName: 'Jane Doe', age: 40, postcode: 'sw1a 1aa' });
    const quote: QuoteResponse = {
      monthlyPremium: 30,
      annualPremium: 360,
      riskBand: 'STANDARD',
      riskScore: 0,
      riskSummary: 'Your details fall within our standard risk range. No additional risk factors.',
      coverageDetails: { propertyType: 'House', propertyValue: 300000, basePremium: 300, coverageLoadFactor: 1.2, riskMultiplier: 1 },
      appliedFactors: [],
      kbVersion: '1.1.0',
    };
    call.flush(quote);
    await fixture.whenStable();

    expect(element.querySelector('app-quote-result')?.textContent).toContain('STANDARD');
    expect(button().textContent?.trim()).toBe('Get my quote');
  });

  it('shows a friendly error when the request fails', async () => {
    await fillValidForm();
    button().click();
    http.expectOne('/policy/quote').flush({}, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(query('[role="alert"]').textContent).toContain(GENERIC_ERROR_MESSAGE);
    expect(button().disabled).toBe(false);
  });

  it('saves a draft without the customer name, and restores it', async () => {
    await fillValidForm();
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}');
    expect(saved).toEqual({ age: 40, propertyType: 'House', propertyValue: 300000, postcode: 'sw1a 1aa', previousClaims: 0 });
    expect(saved).not.toHaveProperty('customerName');

    fixture.destroy();
    await create();
    expect(query<HTMLInputElement>('#postcode').value).toBe('sw1a 1aa');
    expect(query<HTMLInputElement>('#customerName').value).toBe('');
  });

  it('fills the form and shows the quote when an example card is chosen', async () => {
    fixture.destroy();
    const cityFlat: QuoteResponse = {
      monthlyPremium: 66,
      annualPremium: 792,
      riskBand: 'HIGH_RISK',
      riskScore: 70,
      riskSummary: 'Several of your details place this quote in our highest risk range.',
      coverageDetails: { propertyType: 'Flat', propertyValue: 900000, basePremium: 300, coverageLoadFactor: 1.2, riskMultiplier: 2.2 },
      appliedFactors: [],
      kbVersion: '1.1.1',
    };
    await create((body) => (body.customerName === 'Chris Lee' ? cityFlat : null));

    query<HTMLButtonElement>('button.card').click();
    await fixture.whenStable();

    expect(query<HTMLInputElement>('#customerName').value).toBe('Chris Lee');
    expect(query<HTMLInputElement>('#propertyValue').value).toBe('900000');
    expect(query<HTMLSelectElement>('#propertyType').value).toBe('Flat');
    expect(query('app-quote-result').textContent).toContain('£66.00');
    expect(button().disabled).toBe(false);
  });

  it('ignores a corrupt draft', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{not json');
    fixture.destroy();
    await create();
    expect(query<HTMLInputElement>('#postcode').value).toBe('');
  });
});
