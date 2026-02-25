import { NOTIFICATION_IDS } from '@core/constants';
import { filterShoppingListItems, buildNextTriggerDate } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class ShoppingListNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.SHOPPING_LIST;
  readonly priority = 10;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnShoppingList);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const pending = filterShoppingListItems(items);
    if (!pending.length) return null;

    const hour = preferences.notificationHour ?? 9;
    return {
      id: this.id,
      title: t('notifications.shoppingList.title'),
      body: t('notifications.shoppingList.body', { count: pending.length }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    };
  }
}
