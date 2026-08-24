import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NOTIFICATION_IDS, PROJECTED_NOTIFICATION_IDS } from '@core/constants';
import type { PendingNotification } from '@core/services/notifications/notification.plugin';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationRegistryService } from '@core/services/notifications/notification-registry.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { WelcomeNotificationService } from '@core/services/notifications/welcome-notification.service';
import { SettingsPreferencesService } from './settings-preferences.service';
import { ToastService } from '@core/services/shared';

@Injectable()
export class SettingsNotificationsDevStateService {
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly toast = inject(ToastService);

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

  async previewNext(): Promise<{ title: string; body: string } | null> {
    return await this.scheduler.previewNextNotification();
  }

  async fireWinning(): Promise<void> {
    const ok = await this.scheduler.scheduleTestNotification();
    this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireDefinition(definitionId: number): Promise<void> {
    const ok = await this.scheduler.fireDefinitionInFiveSeconds(definitionId);
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
    const ok = await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS)
      || await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.NEAR_EXPIRY)
      || await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.LOW_STOCK);
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

  private notifyOutcome(ok: boolean): void {
    if (ok) {
      this.toast.success('settings.dev.notifications.toast.scheduled');
    } else {
      this.toast.info('settings.dev.notifications.toast.noop');
    }
  }
}
