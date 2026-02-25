import { Injectable, computed, inject } from '@angular/core';
import type { AppPreferences } from '@core/models/settings';
import { SettingsPreferencesService } from './settings-preferences.service';

@Injectable()
export class SettingsNotificationsStateService {
  private readonly appPreferences = inject(SettingsPreferencesService);

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
  readonly notifyOnShoppingList = computed(() =>
    Boolean(this.appPreferences.preferences().notifyOnShoppingList)
  );

  async ionViewWillEnter(): Promise<void> {
    await this.appPreferences.getPreferences();
  }

  async setNotificationsEnabled(value: boolean): Promise<void> {
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

  async setNotifyOnShoppingList(value: boolean): Promise<void> {
    await this.save({ notifyOnShoppingList: value });
  }

  private async save(patch: Partial<AppPreferences>): Promise<void> {
    await this.appPreferences.savePreferences({
      ...this.appPreferences.preferences(),
      ...patch,
    });
  }
}
