import { Injectable, computed, inject } from '@angular/core';
import type { AppPreferences } from '@core/models/settings';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SettingsPreferencesService } from './settings-preferences.service';

@Injectable()
export class SettingsNotificationsStateService {
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly permissionService = inject(NotificationPermissionService);
  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  readonly notificationsEnabled = computed(() =>
    Boolean(this.appPreferences.preferences().notificationsEnabled)
  );
  readonly notifyOnExpired = computed(() =>
    Boolean(this.appPreferences.preferences().notifyOnExpired)
  );
  readonly notifyOnNearExpiry = computed(() =>
    Boolean(this.appPreferences.preferences().notifyOnNearExpiry)
  );
  readonly notifyOnLowStock = computed(() =>
    Boolean(this.appPreferences.preferences().notifyOnLowStock)
  );

  async ionViewWillEnter(): Promise<void> {
    await this.appPreferences.getPreferences();
  }

  async setNotificationsEnabled(value: boolean): Promise<void> {
    if (value && this.permissionService.isPermanentlyDenied()) {
      await this.showPermanentlyDeniedAlert();
      return;
    }
    await this.save({ notificationsEnabled: value });
  }

  async setNotifyOnExpired(value: boolean): Promise<void> {
    await this.save({ notifyOnExpired: value });
  }

  async setNotifyOnNearExpiry(value: boolean): Promise<void> {
    await this.save({ notifyOnNearExpiry: value });
  }

  async setNotifyOnLowStock(value: boolean): Promise<void> {
    await this.save({ notifyOnLowStock: value });
  }

  private async showPermanentlyDeniedAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('settings.notifications.permissionDeniedTitle'),
      message: this.translate.instant('settings.notifications.permissionDeniedMessage'),
      buttons: [this.translate.instant('settings.notifications.permissionDeniedButton')],
    });
    await alert.present();
  }

  private async save(patch: Partial<AppPreferences>): Promise<void> {
    await this.appPreferences.savePreferences({
      ...this.appPreferences.preferences(),
      ...patch,
    });
  }
}
