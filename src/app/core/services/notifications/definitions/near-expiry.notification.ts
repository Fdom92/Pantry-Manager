import { NEAR_EXPIRY_WINDOW_DAYS, NOTIFICATION_IDS } from '@core/constants';
import { filterNearExpiryItems, nearestExpiryDays, buildNextTriggerDate } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class NearExpiryNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.NEAR_EXPIRY;
  readonly priority = 60;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnNearExpiry);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const nearExpiry = filterNearExpiryItems(items, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (!nearExpiry.length) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = nearExpiry.length;
    const nearestDays = nearestExpiryDays(nearExpiry, now);
    const titleKey = count === 1 ? 'notifications.nearExpiry.title_one' : 'notifications.nearExpiry.title';
    let bodyKey: string;
    if (count === 1) {
      bodyKey = nearestDays === 1 ? 'notifications.nearExpiry.body_one_tomorrow' : 'notifications.nearExpiry.body_one';
    } else {
      bodyKey = nearestDays === 1 ? 'notifications.nearExpiry.body_tomorrow' : 'notifications.nearExpiry.body';
    }
    return {
      id: this.id,
      title: t(titleKey),
      body: t(bodyKey, { count, nearestDays }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
