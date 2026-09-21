import { Injectable, inject } from '@angular/core';
import { NOTIFICATION_CHANNEL_ID } from '@core/constants';
import { LoggerService } from '../shared/logger.service';
import { LOCAL_NOTIFICATIONS } from './local-notifications.token';
import type {
  INotificationPlugin,
  NotificationPermissionDisplay,
  NotificationRequestResult,
  PendingNotification,
  ScheduledNotificationInput,
} from './notification.plugin';

@Injectable({ providedIn: 'root' })
export class CapacitorNotificationPlugin implements INotificationPlugin {
  private readonly native = inject(LOCAL_NOTIFICATIONS);
  private readonly logger = inject(LoggerService);

  async requestPermission(): Promise<NotificationRequestResult> {
    try {
      const result = await this.native.requestPermissions();
      return result.display === 'granted' ? 'granted' : 'denied';
    } catch (err) {
      this.logger.error('CapacitorNotificationPlugin', 'requestPermissions failed', err);
      return 'unavailable';
    }
  }

  async checkPermission(): Promise<NotificationPermissionDisplay> {
    try {
      const result = await this.native.checkPermissions();
      return result.display as NotificationPermissionDisplay;
    } catch (err) {
      this.logger.error('CapacitorNotificationPlugin', 'checkPermissions failed', err);
      return 'unavailable';
    }
  }

  async schedule(notifications: ScheduledNotificationInput[]): Promise<void> {
    if (!notifications.length) return;
    await this.native.schedule({
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
    await this.native.cancel({ notifications: ids.map(id => ({ id })) });
  }

  async createChannel(options: { id: string; name: string; importance: number }): Promise<void> {
    try {
      await this.native.createChannel({
        id: options.id,
        name: options.name,
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
      const result = await this.native.getPending();
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

  /**
   * Ids of notifications still in the system tray. A lower bound on delivery:
   * tapped or swiped-away ones are gone, and the same one is seen again on
   * every open until it leaves the tray.
   */
  async getDelivered(): Promise<number[]> {
    try {
      const result = await this.native.getDeliveredNotifications();
      return (result?.notifications ?? [])
        .map(n => Number(n.id))
        .filter(id => Number.isFinite(id));
    } catch (err) {
      this.logger.warn('CapacitorNotificationPlugin', 'getDeliveredNotifications failed', { err: String(err) });
      return [];
    }
  }
}
