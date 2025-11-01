import { Injectable, computed, signal } from '@angular/core';
import { StorageService } from './storage.service';
import {
  AppPreferences,
  AppPreferencesDoc,
  AppThemePreference,
  DefaultUnitPreference,
} from '@core/models';

const STORAGE_KEY = 'app:preferences';
const DOC_TYPE = 'app-preferences';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  defaultUnit: 'unit',
  nearExpiryDays: 3,
  compactView: false,
  notificationsEnabled: false,
  notifyOnExpired: false,
  notifyOnLowStock: false,
  lastSyncAt: null,
};

@Injectable({
  providedIn: 'root',
})
export class AppPreferencesService {
  private readonly ready: Promise<void>;
  private cachedDoc: AppPreferencesDoc | null = null;

  private readonly preferencesSignal = signal<AppPreferences>({ ...DEFAULT_PREFERENCES });
  readonly preferences = computed(() => this.preferencesSignal());

  constructor(
    private readonly storage: StorageService<AppPreferencesDoc>,
  ) {
    this.ready = this.loadFromStorage();
  }

  async getPreferences(): Promise<AppPreferences> {
    await this.ready;
    return this.preferencesSignal();
  }

  async reload(): Promise<AppPreferences> {
    await this.loadFromStorage();
    return this.preferencesSignal();
  }

  async savePreferences(prefs: AppPreferences): Promise<void> {
    const normalized = this.normalizePreferences({
      ...this.preferencesSignal(),
      ...prefs,
    });
    const now = new Date().toISOString();

    const doc: AppPreferencesDoc = {
      _id: STORAGE_KEY,
      type: DOC_TYPE,
      createdAt: this.cachedDoc?.createdAt ?? now,
      updatedAt: now,
      _rev: this.cachedDoc?._rev,
      ...normalized,
      lastSyncAt: normalized.lastSyncAt ?? null,
    };

    const saved = await this.storage.save(doc);
    this.cachedDoc = saved;
    this.preferencesSignal.set(this.normalizePreferences(saved));
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const doc = await this.storage.get(STORAGE_KEY);
      if (doc) {
        this.cachedDoc = doc;
        const normalized = this.normalizePreferences(doc);
        this.preferencesSignal.set(normalized);
      } else {
        this.preferencesSignal.set({ ...DEFAULT_PREFERENCES });
        this.cachedDoc = null;
      }
    } catch (err) {
      console.error('[AppPreferencesService] loadFromStorage error', err);
      this.preferencesSignal.set({ ...DEFAULT_PREFERENCES });
      this.cachedDoc = null;
    }
  }

  private normalizePreferences(input?: Partial<AppPreferences>): AppPreferences {
    return {
      theme: this.ensureTheme(input?.theme),
      defaultUnit: this.ensureUnit(input?.defaultUnit),
      nearExpiryDays: this.ensureNearExpiryDays(input?.nearExpiryDays),
      compactView: Boolean(input?.compactView),
      notificationsEnabled: Boolean(input?.notificationsEnabled),
      notifyOnExpired: Boolean(input?.notifyOnExpired),
      notifyOnLowStock: Boolean(input?.notifyOnLowStock),
      lastSyncAt: input?.lastSyncAt ?? null,
    };
  }

  private ensureTheme(theme?: string): AppThemePreference {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      return theme;
    }
    return DEFAULT_PREFERENCES.theme;
  }

  private ensureUnit(unit?: string): DefaultUnitPreference {
    if (unit === 'kg' || unit === 'g' || unit === 'l' || unit === 'unit') {
      return unit;
    }
    return DEFAULT_PREFERENCES.defaultUnit;
  }

  private ensureNearExpiryDays(value?: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return DEFAULT_PREFERENCES.nearExpiryDays;
    }
    return Math.max(0, Math.round(value));
  }
}
