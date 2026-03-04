export type NotificationPermissionDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export interface INotificationPlugin {
  requestPermission(): Promise<boolean>;
  checkPermission(): Promise<NotificationPermissionDisplay>;
  schedule(notifications: Array<{
    id: number;
    title: string;
    body: string;
    scheduleAt: Date;
  }>): Promise<void>;
  cancel(ids: number[]): Promise<void>;
  createChannel?(options: { id: string; name: string; importance: number }): Promise<void>;
}
