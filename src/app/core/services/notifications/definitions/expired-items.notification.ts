import { NOTIFICATION_IDS } from '@core/constants';
import { buildNextTriggerDate, filterExpiredItems, pickPriorityItem } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class ExpiredItemsNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.EXPIRED_ITEMS;
  readonly priority = 100;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnExpired);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const expired = filterExpiredItems(items, now);
    if (!expired.length) return null;

    const winner = pickPriorityItem(expired, 'expired', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = expired.length;
    const titleKey = count === 1 ? 'notifications.expired.title_one' : 'notifications.expired.title';
    const bodyKey = count === 1
      ? 'notifications.expired.body_one_named'
      : 'notifications.expired.body_many_named';
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey),
      body: t(bodyKey, { name: winner.name, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
