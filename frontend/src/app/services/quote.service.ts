import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import type { QuoteRequest, QuoteResponse, ValidationErrorResponse } from '../models/quote.models';

/** Relative, so the dev server proxy (proxy.conf.json) or the hosting setup decides where it goes. */
const QUOTE_URL = '/policy/quote';
export const GENERIC_ERROR_MESSAGE = "We couldn't get a quote right now. Please try again.";

/** An error whose message is safe to show the customer. */
export class QuoteRequestError extends Error {
  override readonly name = 'QuoteRequestError';
}

function isValidationErrorResponse(body: unknown): body is ValidationErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    body.error === 'VALIDATION_ERROR' &&
    'issues' in body &&
    Array.isArray(body.issues) &&
    body.issues.every(
      (issue: unknown) =>
        typeof issue === 'object' && issue !== null && 'message' in issue && typeof issue.message === 'string',
    )
  );
}

/** 400 VALIDATION_ERROR → the issue messages joined; anything else → a generic, friendly message. */
export function toReadableMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 400 && isValidationErrorResponse(error.error)) {
    const messages = error.error.issues.map((issue) => issue.message);
    if (messages.length > 0) return messages.join('; ');
  }
  return GENERIC_ERROR_MESSAGE;
}

@Service()
export class QuoteService {
  private readonly http = inject(HttpClient);

  /** Errors with a QuoteRequestError whose message can be shown as-is. */
  requestQuote(request: QuoteRequest): Observable<QuoteResponse> {
    return this.http
      .post<QuoteResponse>(QUOTE_URL, request)
      .pipe(catchError((error: unknown) => throwError(() => new QuoteRequestError(toReadableMessage(error)))));
  }
}
