import { Injectable, inject } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { LocalStorageService } from '@core/services/shared';

export type CoachMarkKey = 'add_first_item' | 'pantry:star' | 'list:swipe';

/**
 * One-shot UI hints. Owns both halves of a coach mark — whether it has already
 * been shown, and the analytics that go with it — so a feature never has to
 * pair a `markShown` with a `track` by hand and never touches the raw
 * localStorage keys.
 */
@Injectable({ providedIn: 'root' })
export class CoachMarkStateService {
  private readonly localStorage = inject(LocalStorageService);
  private readonly analytics = inject(AnalyticsService);

  isShown(key: CoachMarkKey): boolean {
    return this.localStorage.coachMark.isShown(key);
  }

  markShown(key: CoachMarkKey): void {
    this.localStorage.coachMark.markShown(key);
  }

  reset(key: CoachMarkKey): void {
    this.localStorage.coachMark.reset(key);
  }

  /** The hint became visible. */
  trackShown(key: CoachMarkKey): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_SHOWN, { key });
  }

  /** Dismissed without acting on it: record it and never show it again. */
  dismiss(key: CoachMarkKey): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_DISMISSED, { key });
    this.markShown(key);
  }

  /** Acted on: record it and never show it again. */
  accept(key: CoachMarkKey): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_TAPPED, { key });
    this.markShown(key);
  }
}
