import { NEAR_EXPIRY_WINDOW_DAYS, NOTIFICATION_IDS } from '@core/constants';
import {
  buildNextTriggerDate,
  filterNearExpiryItems,
  nearestExpiryDays,
  pickPriorityItem,
} from '@core/domain/notifications';
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

    const winner = pickPriorityItem(nearExpiry, 'near-expiry', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = nearExpiry.length;
    const nearestDays = nearestExpiryDays(nearExpiry, now);

    const titleKey = count === 1 ? 'notifications.nearExpiry.title_one' : 'notifications.nearExpiry.title';
    let bodyKey: string;
    if (count === 1) {
      bodyKey = nearestDays === 1
        ? 'notifications.nearExpiry.body_one_named_tomorrow'
        : 'notifications.nearExpiry.body_one_named';
    } else {
      bodyKey = nearestDays === 1
        ? 'notifications.nearExpiry.body_many_named_tomorrow'
        : 'notifications.nearExpiry.body_many_named';
    }
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey, { count }),
      body: t(bodyKey, { name: winner.name, days: nearestDays, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
