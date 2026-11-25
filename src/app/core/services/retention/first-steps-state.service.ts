import { Injectable, inject } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '@core/services/analytics/analytics.service';

/** What an empty app's user picked first: add by hand or scan a receipt, and from which screen. */
@Injectable({ providedIn: 'root' })
export class FirstStepsStateService {
  private readonly analytics = inject(AnalyticsService);

  choose(action: 'add' | 'scan', screen: 'dashboard' | 'pantry'): void {
    this.analytics.track(ANALYTICS_EVENTS.FIRST_STEPS_ACTION, { action, screen });
  }
}
