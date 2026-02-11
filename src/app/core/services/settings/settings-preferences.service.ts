import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_PREFERENCES,
  DOC_TYPE_PREFERENCES,
  NEAR_EXPIRY_WINDOW_DAYS,
  ONBOARDING_STORAGE_KEY,
  PLANNER_MEMORY_MAX_LENGTH,
  SETUP_STORAGE_KEY,
  STORAGE_KEY_PREFERENCES,
} from '@core/constants';
import {
  AppPreferences,
  AppPreferencesDoc,
  AppThemePreference,
} from '@core/models';
import { normalizeStringList, normalizeTrim } from '@core/utils/normalization.util';
import { getBooleanFlag } from '@core/utils/storage-flag.util';
import { StorageService } from '../shared/storage.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsPreferencesService {
  // DI
  private readonly storage = inject<StorageService<AppPreferencesDoc>>(StorageService);
  // DATA
  private readonly ready: Promise<void>;
  private cachedDoc: AppPreferencesDoc | null = null;
  private readonly plannerMemoryLimit = PLANNER_MEMORY_MAX_LENGTH;
  private readonly prefersDarkQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  // SIGNALS
  private readonly preferencesSignal = signal<AppPreferences>({ ...DEFAULT_PREFERENCES });
  // COMPUTED
  readonly preferences = computed(() => this.preferencesSignal());

  constructor() {
    this.ready = this.loadFromStorage();
    this.setupSystemThemeListener();
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
      _id: STORAGE_KEY_PREFERENCES,
      type: DOC_TYPE_PREFERENCES,
      createdAt: this.cachedDoc?.createdAt ?? now,
      updatedAt: now,
      _rev: this.cachedDoc?._rev,
      ...normalized,
      lastSyncAt: normalized.lastSyncAt ?? null,
    };

    const saved = await this.storage.save(doc);
    this.cachedDoc = saved;
    const normalizedPrefs = this.normalizePreferences(saved);
    this.preferencesSignal.set(normalizedPrefs);
    this.applyTheme(normalizedPrefs.theme);
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const doc = await this.storage.get(STORAGE_KEY_PREFERENCES);
      if (doc) {
        this.cachedDoc = doc;
        const normalized = this.normalizePreferences(doc);
        if (this.shouldSeedLocations(normalized.locationOptions)) {
          await this.savePreferences({ ...normalized, locationOptions: ['Pantry'] });
          return;
        }
        this.preferencesSignal.set(normalized);
        this.applyTheme(normalized.theme);
      } else {
        this.applyDefaults();
      }
    } catch (err) {
      console.error('[SettingsPreferencesService] loadFromStorage error', err);
      this.applyDefaults();
    }
  }

  private shouldSeedLocations(locationOptions: string[]): boolean {
    return (
      getBooleanFlag(ONBOARDING_STORAGE_KEY) &&
      !getBooleanFlag(SETUP_STORAGE_KEY) &&
      (!locationOptions || !locationOptions.length)
    );
  }

  private normalizePreferences(input?: Partial<AppPreferences>): AppPreferences {
    return {
      theme: this.ensureTheme(input?.theme),
      nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
      compactView: Boolean(input?.compactView),
      notificationsEnabled: Boolean(input?.notificationsEnabled),
      notifyOnExpired: Boolean(input?.notifyOnExpired),
      notifyOnLowStock: Boolean(input?.notifyOnLowStock),
      lastSyncAt: input?.lastSyncAt ?? null,
      locationOptions: this.ensureLocationOptions(input?.locationOptions),
      categoryOptions: this.ensureCategoryOptions(input?.categoryOptions),
      supermarketOptions: this.ensureSupermarketOptions(input?.supermarketOptions),
      plannerMemory: this.ensurePlannerMemory(input?.plannerMemory),
    };
  }

  private ensureTheme(theme?: string): AppThemePreference {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      return theme;
    }
    return DEFAULT_PREFERENCES.theme;
  }

  private applyTheme(theme: AppThemePreference, systemPrefersDark?: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    const prefersDark = systemPrefersDark ?? this.prefersDarkQuery?.matches ?? false;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    const root = document.documentElement;
    root.classList.toggle('ion-palette-dark', useDark);
    root.classList.toggle('dark', useDark);
    root.setAttribute('data-theme', useDark ? 'dark' : 'light');
    root.style.setProperty('color-scheme', useDark ? 'dark' : 'light');
  }

  private setupSystemThemeListener(): void {
    if (!this.prefersDarkQuery) {
      return;
    }
    const listener = (event: MediaQueryListEvent) => {
      if (this.preferencesSignal().theme === 'system') {
        this.applyTheme('system', event.matches);
      }
    };

    if (typeof this.prefersDarkQuery.addEventListener === 'function') {
      this.prefersDarkQuery.addEventListener('change', listener);
    } else if (typeof this.prefersDarkQuery.addListener === 'function') {
      this.prefersDarkQuery.addListener(listener);
    }
  }

  private ensureLocationOptions(options?: unknown): string[] {
    return normalizeStringList(options, {
      fallback: [],
    });
  }

  private ensureCategoryOptions(options?: unknown): string[] {
    return normalizeStringList(options, {
      fallback: [],
    });
  }

  private ensureSupermarketOptions(options?: unknown): string[] {
    return normalizeStringList(options, {
      fallback: [],
    });
  }

  private ensurePlannerMemory(value?: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = normalizeTrim(value);
    if (!trimmed) {
      return '';
    }
    return trimmed.length > this.plannerMemoryLimit ? trimmed.slice(0, this.plannerMemoryLimit) : trimmed;
  }

  private applyDefaults(): void {
    const defaults = { ...DEFAULT_PREFERENCES };
    this.preferencesSignal.set(defaults);
    this.cachedDoc = null;
    this.applyTheme(defaults.theme);
  }
}
