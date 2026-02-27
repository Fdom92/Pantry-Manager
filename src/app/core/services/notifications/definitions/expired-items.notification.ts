import { NOTIFICATION_IDS } from '@core/constants';
import { filterExpiredItems, buildNextTriggerDate } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class ExpiredItemsNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.EXPIRED_ITEMS;
  readonly priority = 40;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnExpired);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const expired = filterExpiredItems(items, now);
    if (!expired.length) return null;

    const hour = preferences.notificationHour ?? 9;
    return {
      id: this.id,
      title: t('notifications.expired.title'),
      body: t('notifications.expired.body', { count: expired.length }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
