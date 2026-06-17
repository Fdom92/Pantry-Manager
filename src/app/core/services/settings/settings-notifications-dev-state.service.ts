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
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class SettingsNotificationsDevStateService {
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

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
    await this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireDefinition(definitionId: number): Promise<void> {
    const ok = await this.scheduler.fireDefinitionInFiveSeconds(definitionId);
    await this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireWelcome(): Promise<void> {
    if (!this.isNativePlatform) {
      await this.notifyOutcome(false);
      return;
    }
    await this.welcomeNotif.scheduleWelcomeNotification({ delayMs: 5_000 });
    await this.notifyOutcome(true);
    await this.refreshPending();
  }

  async fireProjected(): Promise<void> {
    const ok = await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS)
      || await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.NEAR_EXPIRY)
      || await this.scheduler.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.LOW_STOCK);
    await this.notifyOutcome(ok);
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

  private async notifyOutcome(ok: boolean): Promise<void> {
    const messageKey = ok
      ? 'settings.dev.notifications.toast.scheduled'
      : 'settings.dev.notifications.toast.noop';
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(messageKey),
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }
}
