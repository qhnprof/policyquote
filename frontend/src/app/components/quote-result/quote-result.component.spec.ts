import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuoteResultComponent } from './quote-result.component';

describe('QuoteResultComponent', () => {
  let component: QuoteResultComponent;
  let fixture: ComponentFixture<QuoteResultComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteResultComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteResultComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
