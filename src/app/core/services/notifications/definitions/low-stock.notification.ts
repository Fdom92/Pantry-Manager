import { NOTIFICATION_IDS } from '@core/constants';
import {
  buildNextTriggerDate,
  filterLowStockItems,
  pickPriorityItem,
} from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class LowStockNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.LOW_STOCK;
  readonly priority = 30;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnLowStock);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const lowStock = filterLowStockItems(items);
    if (!lowStock.length) return null;

    const winner = pickPriorityItem(lowStock, 'low-stock', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = lowStock.length;
    const titleKey = count === 1 ? 'notifications.lowStock.title_one' : 'notifications.lowStock.title';
    const bodyKey = count === 1
      ? 'notifications.lowStock.body_one_named'
      : 'notifications.lowStock.body_many_named';
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey, { count }),
      body: t(bodyKey, { name: winner.name, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
