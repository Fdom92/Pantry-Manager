import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import type { NotificationContext, ScheduledNotification } from '@core/models/notifications';
import { ANALYTICS_EVENTS, DEFAULT_NOTIFICATION_HOUR, NOTIFICATION_IDS, PROJECTED_NOTIFICATION_IDS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationPermissionService } from './notification-permission.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { WelcomeNotificationService } from './welcome-notification.service';
import { buildStreakMilestoneNotification } from './definitions/streak-milestone.notification';
import { AppPreferences, PantryItem } from '@core/models';
import { LoggerService } from '../shared/logger.service';

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
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);

  private isScheduling = false;

  constructor() {
    effect(() => {
      this.preferencesService.preferences();
      void this.scheduleAll();
    });

    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.addListener('localNotificationActionPerformed', action => {
        const extra = (action.notification.extra as Record<string, unknown> | undefined) ?? undefined;
        void this.handleNotificationTap(action.notification.id, extra);
      });

      // Delivery, as distinct from engagement. The 30-day export had 124
      // notification_scheduled and not one notification_tapped, and a schedule
      // is only a promise: the OS may drop it, batch it, or never fire it at
      // all. Without this, "they never arrive" and "they arrive and nobody
      // cares" are the same number, and the fixes are opposites.
      void LocalNotifications.addListener('localNotificationReceived', notification => {
        this.analytics.track(ANALYTICS_EVENTS.NOTIFICATION_RECEIVED, {
          notification_id: notification.id,
        });
      });
    }
  }

  private async handleNotificationTap(id: number, extra?: Record<string, unknown>): Promise<void> {
    // Per-item deep-link path (bet A). Items may have been deleted between
    // schedule and tap, so we fall back to plain pantry if the id is unknown.
    const itemId = typeof extra?.['itemId'] === 'string' ? (extra['itemId'] as string) : undefined;
    this.analytics.track(ANALYTICS_EVENTS.NOTIFICATION_TAPPED, {
      notification_id: id,
      has_deep_link: Boolean(itemId),
    });
    if (itemId) {
      const exists = this.pantryStore.loadedProducts().some(p => p._id === itemId);
      if (exists) {
        await this.navCtrl.navigateRoot('/pantry', { queryParams: { focusItem: itemId } });
        return;
      }
      // fall through to id-based routing if the item is gone
    }
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
      case NOTIFICATION_IDS.STREAK_MILESTONE:
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
        await this.welcomeNotif.cancelWelcomeNotification();
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

      await this.cancelAll();
      await this.scheduleProjectedNotifications(items, preferences, now, t);
    } catch (err) {
      this.logger.error('NotificationSchedulerService', 'scheduleAll error', err);
    } finally {
      this.isScheduling = false;
    }
  }

  async cancelAll(): Promise<void> {
    const registryIds = this.registry.getAll().map(d => d.id);
    const allIds = [...registryIds, ...PROJECTED_NOTIFICATION_IDS];
    if (allIds.length) {
      await this.plugin.cancel(allIds);
    }
  }

  private async scheduleProjectedNotifications(
    items: PantryItem[],
    preferences: AppPreferences,
    now: Date,
    t: (key: string, params?: Record<string, unknown>) => string,
    daysAhead = 7
  ): Promise<void> {
    const hour = preferences.notificationHour ?? DEFAULT_NOTIFICATION_HOUR;
    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      scheduleAt: Date;
      extra?: Record<string, unknown>;
    }> = [];

    for (let day = 1; day <= daysAhead; day++) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + day);
      targetDate.setHours(hour, 0, 0, 0);

      const winner = this.evaluateWinningNotification(preferences, items, targetDate, t);
      if (!winner) continue;

      toSchedule.push({
        id: PROJECTED_NOTIFICATION_IDS[day - 1],
        title: winner.title,
        body: winner.body,
        scheduleAt: targetDate,
        extra: winner.extra,
      });
    }

    if (!toSchedule.length) return;

    await this.plugin.schedule(toSchedule);
    this.analytics.track(ANALYTICS_EVENTS.NOTIFICATION_SCHEDULED, {
      count: toSchedule.length,
    });
  }

  /** Schedule a +24h celebration push when a streak milestone is reached. */
  async scheduleStreakMilestone(streak: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const preferences = this.preferencesService.preferences();
    if (!preferences.notificationsEnabled) return;
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);
    const notif = buildStreakMilestoneNotification(streak, t);
    await this.plugin.schedule([notif]);
  }

  /**
   * Evaluate every registered definition against the current pantry and return
   * the winning payload for `now`. Public because the dev panel needs the real
   * evaluation logic without duplicating the context assembly.
   */
  evaluateWinnerNow(now: Date): ScheduledNotification | null {
    const preferences = this.preferencesService.preferences();
    const items = this.pantryStore.loadedProducts();
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);
    return this.evaluateWinningNotification(preferences, items, now, t);
  }

  /**
   * Build one specific definition against the current pantry, ignoring priority.
   * Public for the same reason as evaluateWinnerNow: the dev panel needs the real
   * context assembly, not a copy of it.
   */
  evaluateDefinitionNow(definitionId: number, now: Date): ScheduledNotification | null {
    const definition = this.registry.getById(definitionId);
    if (!definition) return null;

    const preferences = this.preferencesService.preferences();
    const items = this.pantryStore.loadedProducts();
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);

    return definition.build({ items, preferences, t, now });
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
