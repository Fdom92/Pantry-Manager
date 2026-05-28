import { NOTIFICATION_IDS, DEFAULT_NOTIFICATION_HOUR } from '@core/constants';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class ReEngagementNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.RE_ENGAGEMENT;
  // Weekly re-engagement: lower priority than alerts, fires on Sunday morning
  readonly priority = 3;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { t, now, preferences } = context;
    const hour = preferences.notificationHour ?? DEFAULT_NOTIFICATION_HOUR;

    // Schedule for next Sunday at the configured hour (weekly shopping check-in)
    const trigger = this.getNextSunday(now);
    trigger.setHours(hour, 0, 0, 0);

    return {
      id: this.id,
      title: t('notifications.weeklyReminder.title'),
      body: t('notifications.weeklyReminder.body'),
      scheduleAt: trigger.toISOString(),
    };
  }

  private getNextSunday(now: Date): Date {
    const next = new Date(now);
    const dayOfWeek = next.getDay();
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const daysToAdd = daysUntilSunday === 0 ? 7 : daysUntilSunday; // if today is Sunday, schedule next week
    next.setDate(next.getDate() + daysToAdd);
    return next;
  }
}
