import { CurrencyPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import type { QuoteResponse } from '../../models/quote.models';
import { RiskBandBadgeComponent } from '../risk-band-badge/risk-band-badge.component';

@Component({
  imports: [CurrencyPipe, RiskBandBadgeComponent],
  selector: 'app-quote-result',
  styleUrl: './quote-result.component.css',
  templateUrl: './quote-result.component.html',
})
export class QuoteResultComponent {
  readonly quote = input.required<QuoteResponse>();
}
