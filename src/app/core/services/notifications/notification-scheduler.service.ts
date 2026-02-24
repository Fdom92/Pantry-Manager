import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { TranslateService } from '@ngx-translate/core';
import type { NotificationContext, ScheduledNotification } from '@core/models/notifications';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationPermissionService } from './notification-permission.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';

@Injectable({ providedIn: 'root' })
export class NotificationSchedulerService {
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);

  private isScheduling = false;

  constructor() {
    // React to any notification preference change so the schedule stays in sync
    // even if the user changes settings without reopening the app before the
    // scheduled notification fires (scenarios #4 and #5).
    effect(() => {
      this.preferencesService.preferences(); // track dependency
      void this.scheduleAll();
    });
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
        const granted = await this.permission.request();
        if (!granted) return;
      }

      const items = this.pantryStore.loadedProducts();
      const now = new Date();
      const t = (key: string, params?: Record<string, unknown>): string =>
        this.translate.instant(key, params);

      const context: NotificationContext = { items, preferences, t, now };
      const definitions = this.registry.getAll();

      const candidates: Array<{ priority: number; payload: ScheduledNotification }> = [];

      for (const definition of definitions) {
        if (!definition.isEnabled(preferences)) continue;
        const payload = definition.build(context);
        if (payload) {
          candidates.push({ priority: definition.priority, payload });
        }
      }

      // Cancel all known IDs before rescheduling
      await this.cancelAll();

      if (!candidates.length) return;

      // Sort descending by priority and take the winner
      candidates.sort((a, b) => b.priority - a.priority);
      const winner = candidates[0].payload;

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
}
