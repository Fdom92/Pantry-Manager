import { NOTIFICATION_IDS, DEFAULT_NOTIFICATION_HOUR } from '@core/constants';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

const RE_ENGAGEMENT_DAYS = 3;

export class ReEngagementNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.RE_ENGAGEMENT;
  // Lowest priority: only fires when pantry is healthy (no expired, no near-expiry, no low-stock)
  readonly priority = 5;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { t, now, preferences } = context;
    const hour = preferences.notificationHour ?? DEFAULT_NOTIFICATION_HOUR;

    // Schedule 3 days from now at the configured hour.
    // Every time the user opens the app, scheduleAll() cancels and reschedules this —
    // so the notification only fires if the user doesn't open for 3 consecutive days.
    const trigger = new Date(now);
    trigger.setDate(trigger.getDate() + RE_ENGAGEMENT_DAYS);
    trigger.setHours(hour, 0, 0, 0);

    return {
      id: this.id,
      title: t('notifications.reEngagement.title'),
      body: t('notifications.reEngagement.body'),
      scheduleAt: trigger.toISOString(),
    };
  }
}
