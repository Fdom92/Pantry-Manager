import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_CHANNEL_NAME,
} from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';

export type NotificationPermissionState = 'unknown' | 'granted' | 'denied';

@Injectable({ providedIn: 'root' })
export class NotificationPermissionService {
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private channelCreated = false;

  readonly permissionState = signal<NotificationPermissionState>('unknown');

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    // Channel only needs to be created once per app session
    if (!this.channelCreated) {
      await this.createChannel();
      this.channelCreated = true;
    }
    // Only query the system if we don't have a definitive answer yet
    if (this.permissionState() === 'unknown') {
      const granted = await this.plugin.checkPermission();
      this.permissionState.set(granted ? 'granted' : 'denied');
    }
  }

  async request(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    const granted = await this.plugin.requestPermission();
    this.permissionState.set(granted ? 'granted' : 'denied');
    return granted;
  }

  isGranted(): boolean {
    return this.permissionState() === 'granted';
  }

  private async createChannel(): Promise<void> {
    if (this.plugin.createChannel) {
      await this.plugin.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: NOTIFICATION_CHANNEL_NAME,
        importance: 3,
      });
    }
  }
}
