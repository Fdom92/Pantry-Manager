import { Injectable, computed, inject, signal } from '@angular/core';
import { DEFAULT_SETTINGS, DOC_TYPE_SETTINGS, STORAGE_KEY_SETTINGS } from '@core/constants';
import { UserSettings, UserSettingsDoc } from '@core/models/user';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root',
})
export class UserSettingsService {
  // DI
  private readonly storage = inject<StorageService<UserSettingsDoc>>(StorageService);
  // Data
  private readonly ready: Promise<void>;
  private cachedDoc: UserSettingsDoc | null = null;
  // Signals
  private readonly settingsSignal = signal<UserSettings>({ ...DEFAULT_SETTINGS });
  // Computed Signals
  readonly settings = computed(() => this.settingsSignal());

  constructor() {
    this.ready = this.loadFromStorage();
  }

  async getUserSettings(): Promise<UserSettings> {
    await this.ready;
    return this.settingsSignal();
  }

  async reload(): Promise<UserSettings> {
    await this.loadFromStorage();
    return this.settingsSignal();
  }

  async saveUserSettings(settings: UserSettings): Promise<void> {
    const normalized = this.normalizeSettings(settings);
    const now = new Date().toISOString();

    const doc: UserSettingsDoc = {
      _id: STORAGE_KEY_SETTINGS,
      type: DOC_TYPE_SETTINGS,
      createdAt: this.cachedDoc?.createdAt ?? now,
      updatedAt: now,
      _rev: this.cachedDoc?._rev,
      ...normalized,
      favoriteSupermarket: normalized.favoriteSupermarket?.trim()
        ? normalized.favoriteSupermarket.trim()
        : undefined,
    };

    const saved = await this.storage.save(doc);
    this.cachedDoc = saved;
    this.settingsSignal.set(this.normalizeSettings(saved));
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const doc = await this.storage.get(STORAGE_KEY_SETTINGS);
      if (doc) {
        this.cachedDoc = doc;
        this.settingsSignal.set(this.normalizeSettings(doc));
      } else {
        this.settingsSignal.set({ ...DEFAULT_SETTINGS });
        this.cachedDoc = null;
      }
    } catch (err) {
      console.error('[UserSettingsService] loadFromStorage error', err);
      this.settingsSignal.set({ ...DEFAULT_SETTINGS });
      this.cachedDoc = null;
    }
  }

  private normalizeSettings(input?: Partial<UserSettings>): UserSettings {
    return {
      username: (input?.username ?? '').trim(),
      householdName: (input?.householdName ?? '').trim(),
      favoriteSupermarket: (input?.favoriteSupermarket ?? '').trim(),
    };
  }
}
