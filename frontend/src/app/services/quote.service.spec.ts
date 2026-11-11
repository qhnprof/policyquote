import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { QuoteRequest, QuoteResponse } from '../models/quote.models';
import { GENERIC_ERROR_MESSAGE, QuoteRequestError, QuoteService } from './quote.service';

const request: QuoteRequest = {
  customerName: 'Jane Doe',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'SW1A 1AA',
  previousClaims: 0,
};

describe('QuoteService', () => {
  let service: QuoteService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(QuoteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function errorMessageFor(status: number, body: object): string | undefined {
    let message: string | undefined;
    service.requestQuote(request).subscribe({
      error: (error: unknown) => {
        message = error instanceof QuoteRequestError ? error.message : undefined;
      },
    });
    http.expectOne('/policy/quote').flush(body, { status, statusText: 'Error' });
    return message;
  }

  it('POSTs the request to /policy/quote and returns the quote', () => {
    let result: QuoteResponse | undefined;
    service.requestQuote(request).subscribe((quote) => (result = quote));

    const call = http.expectOne('/policy/quote');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush({ riskBand: 'STANDARD', annualPremium: 360 });
    expect(result?.riskBand).toBe('STANDARD');
  });

  it('joins the issue messages of a 400 VALIDATION_ERROR', () => {
    const body = {
      error: 'VALIDATION_ERROR',
      issues: [
        { path: 'age', message: 'Too small' },
        { path: 'postcode', message: 'Must be a valid UK postcode' },
      ],
    };
    expect(errorMessageFor(400, body)).toBe('Too small; Must be a valid UK postcode');
  });

  it('uses the generic message for a 400 that is not a validation error', () => {
    expect(errorMessageFor(400, { error: 'INVALID_JSON' })).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('uses the generic message for a server error', () => {
    expect(errorMessageFor(500, { error: 'INTERNAL_ERROR', requestId: 'x' })).toBe(GENERIC_ERROR_MESSAGE);
  });
});
