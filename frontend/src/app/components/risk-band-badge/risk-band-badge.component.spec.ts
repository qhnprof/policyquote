import { TestBed } from '@angular/core/testing';
import { RiskBandBadgeComponent } from './risk-band-badge.component';

describe('RiskBandBadgeComponent', () => {
  async function render(riskBand: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(RiskBandBadgeComponent);
    fixture.componentRef.setInput('riskBand', riskBand);
    await fixture.whenStable();
    const badge = fixture.nativeElement.querySelector('.badge');
    if (!(badge instanceof HTMLElement)) throw new Error('badge not rendered');
    return badge;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RiskBandBadgeComponent] }).compileComponents();
  });

  it.each([
    ['STANDARD', 'STANDARD', 'badge--standard'],
    ['ELEVATED', 'ELEVATED', 'badge--elevated'],
    ['HIGH_RISK', 'HIGH RISK', 'badge--high'],
    ['VERY_HIGH_RISK', 'VERY HIGH RISK', 'badge--neutral'],
  ])('%s → label "%s" with class %s', async (band, label, modifier) => {
    const badge = await render(band);
    expect(badge.textContent).toContain(label);
    expect(badge.classList).toContain('badge');
    expect(badge.classList).toContain(modifier);
  });
});
