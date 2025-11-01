import { Injectable, computed, signal } from '@angular/core';
import { StorageService } from './storage.service';
import {
  UserSettings,
  UserSettingsDoc,
} from '@core/models';

const STORAGE_KEY = 'user:settings';
const DOC_TYPE = 'user-settings';

const DEFAULT_SETTINGS: UserSettings = {
  username: '',
  householdName: '',
  favoriteSupermarket: '',
};

@Injectable({
  providedIn: 'root',
})
export class UserSettingsService {
  private readonly ready: Promise<void>;
  private cachedDoc: UserSettingsDoc | null = null;

  private readonly settingsSignal = signal<UserSettings>({ ...DEFAULT_SETTINGS });
  readonly settings = computed(() => this.settingsSignal());

  constructor(
    private readonly storage: StorageService<UserSettingsDoc>,
  ) {
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
      _id: STORAGE_KEY,
      type: DOC_TYPE,
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
      const doc = await this.storage.get(STORAGE_KEY);
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
