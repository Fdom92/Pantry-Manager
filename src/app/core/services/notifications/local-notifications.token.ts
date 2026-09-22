import { InjectionToken } from '@angular/core';
import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications';

/**
 * The Capacitor plugin object behind a token, so specs can hand the wrapper a
 * fake instead of spying on Capacitor's proxy object.
 */
export const LOCAL_NOTIFICATIONS = new InjectionToken<LocalNotificationsPlugin>('LOCAL_NOTIFICATIONS', {
  providedIn: 'root',
  factory: () => LocalNotifications,
});
