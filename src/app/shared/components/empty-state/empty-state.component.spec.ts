import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  let fixture: ComponentFixture<EmptyStateComponent>;
  const buttons = () => Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ion-button'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EmptyStateComponent, TranslateModule.forRoot()],
      providers: [{ provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['trackOnce']) }],
    });
    fixture = TestBed.createComponent(EmptyStateComponent);
  });

  it('renders no second button without a secondary label', () => {
    fixture.componentRef.setInput('showAction', true);
    fixture.detectChanges();
    expect(buttons().length).toBe(1);
  });

  it('emits secondaryAction when the second button is pressed', () => {
    const emitted = jasmine.createSpy('secondaryAction');
    const primary = jasmine.createSpy('action');
    fixture.componentInstance.secondaryAction.subscribe(emitted);
    fixture.componentInstance.action.subscribe(primary);
    fixture.componentRef.setInput('showAction', true);
    fixture.componentRef.setInput('secondaryActionLabel', 'Scan');
    fixture.detectChanges();
    expect(buttons().length).toBe(2);
    buttons()[1].click();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(primary).not.toHaveBeenCalled();
  });
});
