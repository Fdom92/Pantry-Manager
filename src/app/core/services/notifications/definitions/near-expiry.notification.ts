import { NEAR_EXPIRY_WINDOW_DAYS, NOTIFICATION_IDS } from '@core/constants';
import { filterNearExpiryItems, buildNextTriggerDate } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class NearExpiryNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.NEAR_EXPIRY;
  readonly priority = 30;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnNearExpiry);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const nearExpiry = filterNearExpiryItems(items, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (!nearExpiry.length) return null;

    const hour = preferences.notificationHour ?? 9;
    return {
      id: this.id,
      title: t('notifications.nearExpiry.title'),
      body: t('notifications.nearExpiry.body', { count: nearExpiry.length, days: NEAR_EXPIRY_WINDOW_DAYS }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
