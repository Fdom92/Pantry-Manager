import { Injectable, inject } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * Root-scoped guards so each track method fires at most once per app session,
 * even when both dashboard and insights render the same card. Resets on cold
 * start naturally (service lives for the lifetime of the app injector).
 */
let wasteViewFiredThisSession = false;
let repoViewFiredThisSession = false;

@Injectable({ providedIn: 'root' })
export class InsightsTrackingStateService {
  private readonly analytics = inject(AnalyticsService);

  trackWasteCardViewed(
    surface: 'dashboard' | 'insights',
    ctx: { isPro: boolean; count: number },
  ): void {
    if (wasteViewFiredThisSession) return;
    wasteViewFiredThisSession = true;
    this.analytics.track(ANALYTICS_EVENTS.WASTE_TRACKER_VIEWED, {
      surface,
      is_pro: ctx.isPro,
      count: ctx.count,
    });
  }

  trackRepoPredictionViewed(
    surface: 'dashboard' | 'insights',
    ctx: { isPro: boolean; count: number },
  ): void {
    if (repoViewFiredThisSession) return;
    repoViewFiredThisSession = true;
    this.analytics.track(ANALYTICS_EVENTS.REPO_PREDICTION_VIEWED, {
      surface,
      is_pro: ctx.isPro,
      count: ctx.count,
    });
  }
}
