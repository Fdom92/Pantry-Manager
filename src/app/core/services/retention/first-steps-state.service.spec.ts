import { TestBed } from '@angular/core/testing';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { FirstStepsStateService } from './first-steps-state.service';

describe('FirstStepsStateService', () => {
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let service: FirstStepsStateService;

  beforeEach(() => {
    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);
    TestBed.configureTestingModule({ providers: [{ provide: AnalyticsService, useValue: analytics }] });
    service = TestBed.inject(FirstStepsStateService);
  });

  it('reports the chosen action and the screen with flat props', () => {
    service.choose('scan', 'pantry');
    expect(analytics.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.FIRST_STEPS_ACTION, { action: 'scan', screen: 'pantry' });
  });

  it('reports add from the dashboard', () => {
    service.choose('add', 'dashboard');
    expect(analytics.track).toHaveBeenCalledWith('first_steps_action', { action: 'add', screen: 'dashboard' });
  });
});
