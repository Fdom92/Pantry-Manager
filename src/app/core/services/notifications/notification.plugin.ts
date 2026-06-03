export type NotificationPermissionDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

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
  requestPermission(): Promise<boolean>;
  checkPermission(): Promise<NotificationPermissionDisplay>;
  schedule(notifications: ScheduledNotificationInput[]): Promise<void>;
  cancel(ids: number[]): Promise<void>;
  createChannel?(options: { id: string; name: string; importance: number }): Promise<void>;
  getPending?(): Promise<PendingNotification[]>;
}
