import { CurrencyPipe, formatCurrency } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of } from 'rxjs';
import { EXAMPLE_PROFILES, type ExampleProfile } from '../../data/example-profiles';
import type { QuoteResponse } from '../../models/quote.models';
import { QuoteService } from '../../services/quote.service';
import { RiskBandBadgeComponent } from '../risk-band-badge/risk-band-badge.component';

export interface ProfileQuote {
  profile: ExampleProfile;
  quote: QuoteResponse;
}

@Component({
  imports: [CurrencyPipe, RiskBandBadgeComponent],
  selector: 'app-example-profiles',
  styleUrl: './example-profiles.component.css',
  templateUrl: './example-profiles.component.html',
})
export class ExampleProfilesComponent {
  private readonly locale = inject(LOCALE_ID);

  protected readonly profiles = EXAMPLE_PROFILES;

  /** Emits when a card is clicked, with the profile and its live quote. */
  readonly profileSelected = output<ProfileQuote>();

  /** null while the prices load; then the profiles that got a quote (failed ones are left out). */
  protected readonly results = signal<ProfileQuote[] | null>(null);

  /** "Home insurance from £<lowest live monthly price> a month", or null until a price has loaded. */
  protected readonly headline = computed(() => {
    const results = this.results();
    if (results === null || results.length === 0) return null;
    const lowest = Math.min(...results.map((result) => result.quote.monthlyPremium));
    return `Home insurance from ${formatCurrency(lowest, this.locale, '£', 'GBP')} a month`;
  });

  constructor() {
    const quoteService = inject(QuoteService);
    // Every profile is priced in parallel. A failed request becomes null, so one bad card never
    // blocks the others; it is simply not shown.
    forkJoin(
      this.profiles.map((profile) =>
        quoteService.requestQuote(profile.request).pipe(
          map((quote): ProfileQuote | null => ({ profile, quote })),
          catchError(() => of(null)),
        ),
      ),
    )
      .pipe(takeUntilDestroyed())
      .subscribe((results) => this.results.set(results.filter((result): result is ProfileQuote => result !== null)));
  }

  protected select(result: ProfileQuote): void {
    this.profileSelected.emit(result);
  }
}
