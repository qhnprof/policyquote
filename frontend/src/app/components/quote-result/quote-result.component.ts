import { Component, input } from '@angular/core';
import type { QuoteResponse } from '../../models/quote.models';

@Component({
  imports: [],
  selector: 'app-quote-result',
  styleUrl: './quote-result.component.css',
  templateUrl: './quote-result.component.html',
})
export class QuoteResultComponent {
  readonly quote = input.required<QuoteResponse>();
}
