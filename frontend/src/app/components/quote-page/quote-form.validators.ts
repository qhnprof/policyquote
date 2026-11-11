import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Mirrors the rules in backend/src/validation/quote-request.schema.ts. The backend stays the
// authority (it re-validates every request); these exist so the customer gets instant feedback.

/** Same pattern as the backend, applied after removing spaces and uppercasing. */
const UK_POSTCODE_COMPACT = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

/** Rejects a value that is only whitespace (the backend trims names before checking length). */
export const notBlank: ValidatorFn = (control: AbstractControl<unknown>): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.length > 0 && control.value.trim() === ''
    ? { notBlank: true }
    : null;

/** Whole numbers only. Empty values are left to Validators.required. */
export const integer: ValidatorFn = (control: AbstractControl<unknown>): ValidationErrors | null =>
  typeof control.value === 'number' && !Number.isInteger(control.value) ? { integer: true } : null;

/** Strictly greater than zero. */
export const positive: ValidatorFn = (control: AbstractControl<unknown>): ValidationErrors | null =>
  typeof control.value === 'number' && control.value <= 0 ? { positive: true } : null;

/** A UK postcode in any case or spacing ("sw1a1aa" is fine; the backend normalises it). */
export const ukPostcode: ValidatorFn = (control: AbstractControl<unknown>): ValidationErrors | null => {
  if (typeof control.value !== 'string' || control.value.trim() === '') return null;
  return UK_POSTCODE_COMPACT.test(control.value.toUpperCase().replace(/\s+/g, '')) ? null : { ukPostcode: true };
};
