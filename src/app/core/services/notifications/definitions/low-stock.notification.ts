import { NOTIFICATION_IDS } from '@core/constants';
import { filterLowStockItems, buildNextTriggerDate } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class LowStockNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.LOW_STOCK;
  readonly priority = 20;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnLowStock);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const lowStock = filterLowStockItems(items);
    if (!lowStock.length) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = lowStock.length;
    const titleKey = count === 1 ? 'notifications.lowStock.title_one' : 'notifications.lowStock.title';
    const bodyKey = count === 1 ? 'notifications.lowStock.body_one' : 'notifications.lowStock.body';
    return {
      id: this.id,
      title: t(titleKey),
      body: t(bodyKey, { count }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
