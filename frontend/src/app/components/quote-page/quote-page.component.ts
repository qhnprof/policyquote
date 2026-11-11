import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { PROPERTY_TYPES, type PropertyType, type QuoteRequest, type QuoteResponse } from '../../models/quote.models';
import { GENERIC_ERROR_MESSAGE, QuoteService } from '../../services/quote.service';
import { QuoteResultComponent } from '../quote-result/quote-result.component';
import { integer, notBlank, positive, ukPostcode } from './quote-form.validators';

/** localStorage key for the form draft. */
export const DRAFT_STORAGE_KEY = 'policyquote.quote-draft';

/** The draft deliberately leaves out customerName: no personal name is stored in the browser. */
interface QuoteDraft {
  age?: number | null;
  propertyType?: PropertyType;
  propertyValue?: number | null;
  postcode?: string;
  previousClaims?: number | null;
}

type QuoteFormField = 'customerName' | 'age' | 'propertyType' | 'propertyValue' | 'postcode' | 'previousClaims';

/** Shown under a touched field when its value breaks the rule (other than being empty). */
const FIELD_RULES: Record<QuoteFormField, string> = {
  customerName: 'Enter your name (up to 100 characters).',
  age: 'Enter an age between 18 and 120, in whole years.',
  propertyType: 'Choose a property type.',
  propertyValue: 'Enter a value above £0 and up to £50,000,000.',
  postcode: 'Enter a valid UK postcode, for example SW1A 1AA.',
  previousClaims: 'Enter a whole number of claims from 0 to 20.',
};

const isPropertyType = (value: unknown): value is PropertyType =>
  PROPERTY_TYPES.some((type) => type === value);
const isNumberOrNull = (value: unknown): value is number | null => value === null || typeof value === 'number';

/** Reads the saved draft, keeping only known keys with the right types. Never throws. */
function readDraft(): QuoteDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return {};
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return {};
    const draft: QuoteDraft = {};
    if ('age' in saved && isNumberOrNull(saved.age)) draft.age = saved.age;
    if ('propertyType' in saved && isPropertyType(saved.propertyType)) draft.propertyType = saved.propertyType;
    if ('propertyValue' in saved && isNumberOrNull(saved.propertyValue)) draft.propertyValue = saved.propertyValue;
    if ('postcode' in saved && typeof saved.postcode === 'string') draft.postcode = saved.postcode;
    if ('previousClaims' in saved && isNumberOrNull(saved.previousClaims)) draft.previousClaims = saved.previousClaims;
    return draft;
  } catch {
    return {};
  }
}

@Component({
  imports: [ReactiveFormsModule, QuoteResultComponent],
  selector: 'app-quote-page',
  styleUrl: './quote-page.component.css',
  templateUrl: './quote-page.component.html',
})
export class QuotePageComponent {
  private readonly quoteService = inject(QuoteService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly propertyTypes = PROPERTY_TYPES;

  // Number controls are `number | null`: an empty <input type="number"> really produces null.
  protected readonly form = this.fb.group({
    customerName: ['', [Validators.required, Validators.maxLength(100), notBlank]],
    age: this.fb.control<number | null>(null, [Validators.required, integer, Validators.min(18), Validators.max(120)]),
    propertyType: this.fb.control<PropertyType>('House', Validators.required),
    propertyValue: this.fb.control<number | null>(null, [Validators.required, positive, Validators.max(50_000_000)]),
    postcode: ['', [Validators.required, ukPostcode]],
    previousClaims: this.fb.control<number | null>(0, [
      Validators.required,
      integer,
      Validators.min(0),
      Validators.max(20),
    ]),
  });

  /** True while a quote request is in flight. */
  protected readonly loading = signal(false);
  /** The latest quote, or null before the first one (and while a new one is requested). */
  protected readonly quoteResult = signal<QuoteResponse | null>(null);
  /** A customer-safe error from the last request, or null. */
  protected readonly errorMessage = signal<string | null>(null);

  /** The form's status and value as signals, so computed() and effect() can react to them. */
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** The button is enabled only for a valid form with no request in flight (no double submits). */
  protected readonly canSubmit = computed(() => this.formStatus() === 'VALID' && !this.loading());
  protected readonly submitLabel = computed(() => (this.loading() ? 'Getting your quote…' : 'Get my quote'));

  constructor() {
    this.form.patchValue(readDraft());

    // An effect, not a computed: writing to localStorage is a side effect on an API outside Angular,
    // while computed() must stay pure and only derive a value.
    effect(() => {
      const { age, propertyType, propertyValue, postcode, previousClaims } = this.formValue();
      const draft: QuoteDraft = { age, propertyType, propertyValue, postcode, previousClaims };
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // Storage can be full, disabled or blocked (private mode): the draft is a convenience only.
      }
    });
  }

  /** The message under a field: shown once the field is touched and invalid. */
  protected fieldError(field: QuoteFormField): string | null {
    const control = this.form.controls[field];
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'This field is required.' : FIELD_RULES[field];
  }

  protected submit(): void {
    const request = this.toRequest();
    if (request === null || !this.canSubmit()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.quoteResult.set(null);

    this.quoteService
      .requestQuote(request)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (quote) => this.quoteResult.set(quote),
        error: (error: unknown) => this.errorMessage.set(error instanceof Error ? error.message : GENERIC_ERROR_MESSAGE),
      });
  }

  /** The API request, or null if a required number is still empty. */
  private toRequest(): QuoteRequest | null {
    const { customerName, age, propertyType, propertyValue, postcode, previousClaims } = this.form.getRawValue();
    if (age === null || propertyValue === null || previousClaims === null) return null;
    return { customerName: customerName.trim(), age, propertyType, propertyValue, postcode: postcode.trim(), previousClaims };
  }
}
