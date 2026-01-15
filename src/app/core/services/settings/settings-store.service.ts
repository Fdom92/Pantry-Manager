import { Injectable, computed, inject } from '@angular/core';
import type { AppPreferences, AppThemePreference } from '@core/models';
import type { BaseDoc } from '@core/models/shared';
import { StorageService } from '../shared/storage.service';
import { RevenuecatService } from '../upgrade/revenuecat.service';
import { AppPreferencesService } from './app-preferences.service';

@Injectable({ providedIn: 'root' })
export class SettingsStoreService {
  private readonly storage = inject<StorageService<BaseDoc>>(StorageService);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro$ = this.revenuecat.isPro$;
  readonly preferences = this.appPreferences.preferences;
  readonly themePreference = computed<AppThemePreference>(() => this.appPreferences.preferences().theme);

  async getPreferences(): Promise<void> {
    await this.appPreferences.getPreferences();
  }

  async reloadPreferences(): Promise<void> {
    await this.appPreferences.reload();
  }

  getPreferencesSnapshot(): AppPreferences {
    return this.appPreferences.preferences();
  }

  async savePreferences(next: AppPreferences): Promise<void> {
    await this.appPreferences.savePreferences(next);
  }

  async clearAll(): Promise<void> {
    await this.storage.clearAll();
  }

  async allDocs(): Promise<BaseDoc[]> {
    return this.storage.all();
  }

  async bulkSave(docs: BaseDoc[]): Promise<void> {
    await this.storage.bulkSave(docs);
  }
}
