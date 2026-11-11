import { Component, computed, input } from '@angular/core';

/** Colour per known band. Any other band (e.g. a new one added to the KB) gets the neutral style. */
const BAND_MODIFIERS: Readonly<Record<string, string>> = {
  STANDARD: 'badge--standard',
  ELEVATED: 'badge--elevated',
  HIGH_RISK: 'badge--high',
};
const NEUTRAL_MODIFIER = 'badge--neutral';

@Component({
  imports: [],
  selector: 'app-risk-band-badge',
  styleUrl: './risk-band-badge.component.css',
  templateUrl: './risk-band-badge.component.html',
})
export class RiskBandBadgeComponent {
  readonly riskBand = input.required<string>();

  /** "HIGH_RISK" → "HIGH RISK". */
  protected readonly label = computed(() => this.riskBand().replaceAll('_', ' '));
  protected readonly modifierClass = computed(() => BAND_MODIFIERS[this.riskBand()] ?? NEUTRAL_MODIFIER);
}
