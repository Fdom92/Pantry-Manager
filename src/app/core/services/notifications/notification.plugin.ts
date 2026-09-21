/**
 * 'unavailable' means the plugin itself failed. It is not a user decision and
 * must never be treated as 'denied' — doing so used to switch the user's
 * notification toggle off silently.
 */
export type NotificationPermissionDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unavailable';

export type NotificationRequestResult = 'granted' | 'denied' | 'unavailable';

export interface ScheduledNotificationInput {
  id: number;
  title: string;
  body: string;
  scheduleAt: Date;
  extra?: Record<string, unknown>;
}

export interface PendingNotification {
  id: number;
  title?: string;
  body?: string;
  scheduleAt?: string;
  extra?: Record<string, unknown>;
}

export interface INotificationPlugin {
  requestPermission(): Promise<NotificationRequestResult>;
  checkPermission(): Promise<NotificationPermissionDisplay>;
  schedule(notifications: ScheduledNotificationInput[]): Promise<void>;
  cancel(ids: number[]): Promise<void>;
  createChannel?(options: { id: string; name: string; importance: number }): Promise<void>;
  getPending?(): Promise<PendingNotification[]>;
  getDelivered?(): Promise<number[]>;
}
