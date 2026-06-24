import { NOTIFICATION_IDS, DEFAULT_NOTIFICATION_HOUR, NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import {
  filterExpiredItems,
  filterNearExpiryItems,
  filterLowStockItems,
} from '@core/domain/notifications';
import { isIncomplete } from '@core/domain/pantry/pantry-filtering.domain';
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
    const { items, t, now, preferences } = context;
    const hour = preferences.notificationHour ?? DEFAULT_NOTIFICATION_HOUR;

    const trigger = this.getNextSunday(now);
    trigger.setHours(hour, 0, 0, 0);

    const expired    = filterExpiredItems(items, now).length;
    const expiring   = filterNearExpiryItems(items, now, NEAR_EXPIRY_WINDOW_DAYS).length;
    const lowStock   = filterLowStockItems(items).length;
    const pendientes = items.filter(isIncomplete).length;

    const body = this.buildBody(t, expired, expiring, lowStock, pendientes);

    return {
      id: this.id,
      title: t('notifications.weeklyReminder.title'),
      body,
      scheduleAt: trigger.toISOString(),
    };
  }

  private buildBody(
    t: NotificationContext['t'],
    expired: number,
    expiring: number,
    lowStock: number,
    pendientes: number,
  ): string {
    if (expired > 0) {
      return t('notifications.weeklyReminder.body_expired', { count: expired });
    }
    if (expiring > 0) {
      return t('notifications.weeklyReminder.body_expiring', { count: expiring });
    }
    if (lowStock > 0) {
      return t('notifications.weeklyReminder.body_lowStock', { count: lowStock });
    }
    if (pendientes > 0) {
      return t('notifications.weeklyReminder.body_pendientes', { count: pendientes });
    }
    return t('notifications.weeklyReminder.body_clean');
  }

  private getNextSunday(now: Date): Date {
    const next = new Date(now);
    const dayOfWeek = next.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const daysToAdd = daysUntilSunday === 0 ? 7 : daysUntilSunday;
    next.setDate(next.getDate() + daysToAdd);
    return next;
  }
}
