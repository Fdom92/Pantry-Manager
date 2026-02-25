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
    return {
      id: this.id,
      title: t('notifications.lowStock.title'),
      body: t('notifications.lowStock.body', { count: lowStock.length }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
