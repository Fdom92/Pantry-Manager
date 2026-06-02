import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import type { NotificationContext, ScheduledNotification } from '@core/models/notifications';
import { NOTIFICATION_IDS } from '@core/constants';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationPermissionService } from './notification-permission.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { AppPreferences, PantryItem } from '@core/models';

@Injectable({ providedIn: 'root' })
export class NotificationSchedulerService {
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly navigationPreset = inject(PantryNavigationPresetService);
  private readonly navCtrl = inject(NavController);
  private readonly translate = inject(TranslateService);

  private isScheduling = false;

  constructor() {
    effect(() => {
      this.preferencesService.preferences();
      this.pantryStore.loadedProducts();
      void this.scheduleAll();
    });

    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.addListener('localNotificationActionPerformed', action => {
        void this.handleNotificationTap(action.notification.id);
      });
    }
  }

  private async handleNotificationTap(id: number): Promise<void> {
    switch (id) {
      case NOTIFICATION_IDS.EXPIRED_ITEMS:
        this.navigationPreset.setPending({ expired: true });
        break;
      case NOTIFICATION_IDS.NEAR_EXPIRY:
        this.navigationPreset.setPending({ expiring: true });
        break;
      case NOTIFICATION_IDS.LOW_STOCK:
        this.navigationPreset.setPending({ lowStock: true });
        break;
      case NOTIFICATION_IDS.RE_ENGAGEMENT:
        // Weekly reminder: navigate to pantry with add modal open for shopping entry
        await this.navCtrl.navigateRoot('/pantry', { queryParams: { openAddModal: 'true' } });
        return;
      case NOTIFICATION_IDS.WELCOME: {
        const count = this.pantryStore.loadedProducts().length;
        const queryParams = count > 0 ? {} : { openAddModal: 'true' };
        await this.navCtrl.navigateRoot('/pantry', { queryParams });
        return;
      }
      case NOTIFICATION_IDS.RECOVERY_D2:
      case NOTIFICATION_IDS.RECOVERY_D5:
      case NOTIFICATION_IDS.RECOVERY_D10:
        await this.navCtrl.navigateRoot('/dashboard');
        return;
    }
    await this.navCtrl.navigateRoot('/pantry');
  }

  /**
   * Evaluates all registered definitions, picks the one with the highest priority
   * that has something to notify about, and schedules only that one.
   * All other notification IDs are cancelled.
   * Safe to call on every app launch — no-op on web.
   */
  async scheduleAll(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (this.isScheduling) return;

    this.isScheduling = true;
    try {
      await this.permission.init();

      const preferences = this.preferencesService.preferences();

      if (!preferences.notificationsEnabled) {
        await this.cancelAll();
        return;
      }

      if (!this.permission.isGranted()) {
        if (this.permission.isPermanentlyDenied()) {
          // User chose "Don't ask again" — cannot request. Auto-disable the toggle.
          // The settings UI will show a friendly alert explaining how to re-enable.
          await this.preferencesService.savePreferences({
            ...this.preferencesService.preferences(),
            notificationsEnabled: false,
          });
          return;
        }
        // Only request permission once per session to avoid showing the system dialog
        // repeatedly (e.g. when the app resumes after the user dismisses the dialog).
        if (this.permission.wasRequested) return;
        const granted = await this.permission.request();
        if (!granted) {
          // Mirror the system decision back into preferences so the toggle goes OFF
          // automatically — avoids the confusing state where toggle is ON but no
          // notifications arrive.
          await this.preferencesService.savePreferences({
            ...this.preferencesService.preferences(),
            notificationsEnabled: false,
          });
          return;
        }
      }

      const items = this.pantryStore.loadedProducts();
      const now = new Date();
      const t = (key: string, params?: Record<string, unknown>): string =>
        this.translate.instant(key, params);

      // Cancel all known IDs before rescheduling
      await this.cancelAll();

      const winner = this.evaluateWinningNotification(preferences, items, now, t);
      if (!winner) return;

      await this.plugin.schedule([{
        id: winner.id,
        title: winner.title,
        body: winner.body,
        scheduleAt: new Date(winner.scheduleAt),
      }]);
    } catch (err) {
      console.error('[NotificationSchedulerService] scheduleAll error', err);
    } finally {
      this.isScheduling = false;
    }
  }

  async cancelAll(): Promise<void> {
    const allIds = this.registry.getAll().map(d => d.id);
    if (allIds.length) {
      await this.plugin.cancel(allIds);
    }
  }

  /**
   * Dev-only: runs the real evaluation logic but fires the winning notification
   * at the given hour:minute today.
   * Returns true if a notification was scheduled, false otherwise.
   */
  async scheduleNotificationAtTime(hour: number, minute: number): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    await this.permission.init();

    if (!this.permission.isGranted()) {
      const granted = await this.permission.request();
      if (!granted) return false;
    }

    const preferences = this.preferencesService.preferences();
    const items = this.pantryStore.loadedProducts();
    const now = new Date();
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);

    const winner = this.evaluateWinningNotification(preferences, items, now, t);
    if (!winner) return false;

    const scheduleAt = new Date();
    scheduleAt.setHours(hour, minute, 0, 0);

    await this.plugin.schedule([{
      id: winner.id,
      title: winner.title,
      body: winner.body,
      scheduleAt,
    }]);

    return true;
  }

  /**
   * Dev-only: evaluates all registered definitions and returns the winning
   * notification payload without scheduling anything.
   * Returns null if no notification would be scheduled.
   */
  async previewNextNotification(): Promise<{ title: string; body: string } | null> {
    const preferences = this.preferencesService.preferences();
    const items = this.pantryStore.loadedProducts();
    const now = new Date();
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);

    const winner = this.evaluateWinningNotification(preferences, items, now, t);
    if (!winner) return null;

    return { title: winner.title, body: winner.body };
  }

  /**
   * Dev-only: runs the real evaluation logic but fires the winning notification
   * in 5 seconds regardless of the configured notification hour.
   * Returns true if a notification was scheduled, false otherwise.
   */
  async scheduleTestNotification(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    await this.permission.init();

    if (!this.permission.isGranted()) {
      const granted = await this.permission.request();
      if (!granted) return false;
    }

    const preferences = this.preferencesService.preferences();
    const items = this.pantryStore.loadedProducts();
    const now = new Date();
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);

    const winner = this.evaluateWinningNotification(preferences, items, now, t);
    if (!winner) return false;

    await this.plugin.schedule([{
      id: winner.id,
      title: winner.title,
      body: winner.body,
      scheduleAt: new Date(Date.now() + 5_000),
    }]);

    return true;
  }

  /** Evaluate all notification definitions and return the highest-priority payload. */
  private evaluateWinningNotification(
    preferences: AppPreferences,
    items: PantryItem[],
    now: Date,
    translate: (key: string, params?: Record<string, unknown>) => string
  ): ScheduledNotification | null {
    const context: NotificationContext = { items, preferences, t: translate, now };
    const definitions = this.registry.getAll();
    const candidates: Array<{ priority: number; payload: ScheduledNotification }> = [];

    for (const definition of definitions) {
      if (!definition.isEnabled(preferences)) continue;
      const payload = definition.build(context);
      if (payload) {
        candidates.push({ priority: definition.priority, payload });
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].payload;
  }
}
