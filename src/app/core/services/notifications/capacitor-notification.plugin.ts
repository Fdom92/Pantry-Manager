import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NOTIFICATION_CHANNEL_ID } from '@core/constants';
import type {
  INotificationPlugin,
  NotificationPermissionDisplay,
  PendingNotification,
  ScheduledNotificationInput,
} from './notification.plugin';

@Injectable({ providedIn: 'root' })
export class CapacitorNotificationPlugin implements INotificationPlugin {

  async requestPermission(): Promise<boolean> {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    }
  }

  async checkPermission(): Promise<NotificationPermissionDisplay> {
    try {
      const result = await LocalNotifications.checkPermissions();
      return result.display as NotificationPermissionDisplay;
    } catch {
      return 'denied';
    }
  }

  async schedule(notifications: ScheduledNotificationInput[]): Promise<void> {
    if (!notifications.length) return;
    await LocalNotifications.schedule({
      notifications: notifications.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.scheduleAt, allowWhileIdle: true },
        channelId: NOTIFICATION_CHANNEL_ID,
        extra: n.extra ?? undefined,
      })),
    });
  }

  async cancel(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await LocalNotifications.cancel({
      notifications: ids.map(id => ({ id })),
    });
  }

  async createChannel(options: { id: string; name: string; importance: number }): Promise<void> {
    try {
      await LocalNotifications.createChannel({
        id: options.id,
        name: options.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        importance: options.importance as any,
        visibility: 1,
        sound: 'default',
      });
    } catch {
      // silently ignored on iOS
    }
  }

  async getPending(): Promise<PendingNotification[]> {
    try {
      const result = await LocalNotifications.getPending();
      return (result?.notifications ?? []).map(n => ({
        id: typeof n.id === 'number' ? n.id : Number(n.id),
        title: n.title,
        body: n.body,
        scheduleAt: n.schedule?.at instanceof Date ? n.schedule.at.toISOString() : undefined,
        extra: (n.extra as Record<string, unknown> | undefined) ?? undefined,
      }));
    } catch {
      return [];
    }
  }
}
