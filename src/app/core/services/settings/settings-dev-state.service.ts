import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NOTIFICATION_IDS, PROJECTED_NOTIFICATION_IDS } from '@core/constants';
import type { PendingNotification } from '@core/services/notifications/notification.plugin';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationRegistryService } from '@core/services/notifications/notification-registry.service';
import { WelcomeNotificationService } from '@core/services/notifications/welcome-notification.service';
import { SettingsPreferencesService } from './settings-preferences.service';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { PantryQueryService } from '@core/services/pantry/pantry-query.service';
import { UpgradeRevenuecatService } from '@core/services/upgrade/upgrade-revenuecat.service';
import { LocalStorageService } from '@core/services/shared/local-storage.service';
import { LoggerService } from '@core/services/shared/logger.service';
import { ToastService } from '@core/services/shared';
import type { DevNotificationsService } from '@core/services/dev/dev-notifications.service';

/**
 * Everything the dev panel in Settings can do. Page-scoped and only ever
 * reached from a build where the panel is visible — keeping these
 * dependencies here is what lets the Settings page itself stay a page.
 */
@Injectable()
export class SettingsDevStateService {
  private readonly injector = inject(Injector);
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);
  private readonly pantry = inject(PantryQueryService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);

  readonly isNativePlatform = Capacitor.isNativePlatform();
  readonly pending = signal<PendingNotification[]>([]);
  readonly permissionState = computed(() => this.permission.permissionState());
  readonly notificationsEnabled = computed(() =>
    Boolean(this.preferencesService.preferences().notificationsEnabled),
  );

  readonly registeredDefinitions = computed(() =>
    this.registry.getAll().map(d => ({ id: d.id, priority: d.priority })),
  );

  async refreshPending(): Promise<void> {
    if (!this.isNativePlatform) {
      this.pending.set([]);
      return;
    }
    const list = await this.plugin.getPending?.() ?? [];
    this.pending.set(list);
  }

  private async dev(): Promise<DevNotificationsService> {
    const { DevNotificationsService } = await import('@core/services/dev/dev-notifications.service');
    return this.injector.get(DevNotificationsService);
  }

  async previewNext(): Promise<{ title: string; body: string } | null> {
    return (await this.dev()).previewNext();
  }

  async fireWinning(): Promise<void> {
    await this.fireWinningAt(new Date(Date.now() + 5_000));
  }

  /** Backs the panel's "schedule at hh:mm" button. */
  async fireWinningAt(at: Date): Promise<void> {
    const ok = await (await this.dev()).fireWinning(at);
    this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireDefinition(definitionId: number): Promise<void> {
    const ok = await (await this.dev()).fireDefinition(definitionId);
    this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireWelcome(): Promise<void> {
    if (!this.isNativePlatform) {
      this.notifyOutcome(false);
      return;
    }
    await this.welcomeNotif.scheduleWelcomeNotification({ delayMs: 5_000 });
    this.notifyOutcome(true);
    await this.refreshPending();
  }

  async fireProjected(): Promise<void> {
    const dev = await this.dev();
    const ok = await dev.fireDefinition(NOTIFICATION_IDS.EXPIRED_ITEMS)
      || await dev.fireDefinition(NOTIFICATION_IDS.NEAR_EXPIRY)
      || await dev.fireDefinition(NOTIFICATION_IDS.LOW_STOCK);
    this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async cancelAll(): Promise<void> {
    const allIds = [
      ...this.registry.getAll().map(d => d.id),
      NOTIFICATION_IDS.WELCOME,
      ...PROJECTED_NOTIFICATION_IDS,
    ];
    await this.plugin.cancel(allIds);
    await this.refreshPending();
  }

  // ─── Datos ────────────────────────────────────────────────────────────────

  /** Wipe every pantry item, one by one, and reload the list from scratch. */
  async clearPantry(): Promise<void> {
    const items = await this.pantry.getAll();
    for (const item of items) {
      await this.pantry.deleteItem(item._id);
    }
    await this.pantry.reloadFromStart();
  }

  /** Counts behind the dev "app state" dump. */
  async getPantrySummary(): Promise<{ total: number; expired: number; nearExpiry: number; lowStock: number }> {
    return await this.pantry.getSummary();
  }

  /** Populate a realistic pantry for store screenshots. Loaded on demand. */
  async seedMarketingDatabase(lang: string): Promise<void> {
    const { DevMarketingSeederService } = await import('@core/services/dev/dev-marketing-seeder.service');
    await this.injector.get(DevMarketingSeederService).seedMarketingDatabase(lang);
  }

  // ─── Estado de la app ─────────────────────────────────────────────────────

  /** Wipe every per-device flag, for a truly fresh-install experience. */
  resetOnboarding(): void {
    this.localStorage.onboarding.reset();
  }

  isPro(): boolean {
    return this.revenuecat.isPro();
  }

  setProState(isPro: boolean): void {
    this.revenuecat.setDevProState(isPro);
  }

  markDeviceAsInternal(): void {
    this.analytics.markAsInternal();
    const id = this.analytics.getDistinctId() ?? '—';
    this.toast.raw(`Marked as internal. ID: ${id}`, { duration: 3000 });
  }

  /**
   * Put the app back in the state where the re-consent sheet is due:
   *  - Keep `hasSeenOnboarding = true` (the user must look like an existing one).
   *  - Clear the one-shot `reconsent:shown` flag.
   *  - Wipe the consent decision timestamps from PouchDB preferences so
   *    `ReconsentPromptService.resolvePendingQuestions()` reports both as pending.
   *
   * Returns once the state is written; the caller reloads the app.
   */
  async prepareReconsentSheet(): Promise<void> {
    this.localStorage.onboarding.setSeen(true);
    // Direct primitive — we want the flag *cleared*, and the service only
    // exposes markShown(). Acceptable in a dev tool.
    localStorage.removeItem('reconsent:shown');

    try {
      const prefs = await this.preferencesService.getPreferences();
      await this.preferencesService.savePreferences({
        ...prefs,
        analyticsDecidedAt: null,
        notificationsDecidedAt: null,
        analyticsEnabled: undefined,
      });
    } catch (err) {
      this.logger.warn('SettingsDevStateService', 'reconsent reset prefs error', { err: String(err) });
    }
  }

  private notifyOutcome(ok: boolean): void {
    if (ok) {
      this.toast.success('settings.dev.notifications.toast.scheduled');
    } else {
      this.toast.info('settings.dev.notifications.toast.noop');
    }
  }
}
