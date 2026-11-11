import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RiskBandBadgeComponent } from './risk-band-badge.component';

describe('RiskBandBadgeComponent', () => {
  let component: RiskBandBadgeComponent;
  let fixture: ComponentFixture<RiskBandBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RiskBandBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RiskBandBadgeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
