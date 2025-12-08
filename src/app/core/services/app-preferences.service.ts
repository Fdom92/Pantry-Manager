import { Injectable, computed, signal } from '@angular/core';
import {
  AppPreferences,
  AppPreferencesDoc,
  AppThemePreference,
  DefaultUnitPreference,
  MeasurementUnit,
} from '@core/models';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'app:preferences';
const DOC_TYPE = 'app-preferences';

export const DEFAULT_LOCATION_OPTIONS = ['Despensa', 'Nevera', 'Cocina', 'Congelador'];
export const DEFAULT_CATEGORY_OPTIONS = [
  'Lácteos',
  'Cereales',
  'Pastas',
  'Frescos',
  'Conservas',
  'Embutidos',
  'Dulces',
  'Snacks',
  'Bebidas',
  'Salsas',
  'Especias',
];
export const DEFAULT_SUPERMARKET_OPTIONS = [
  'Lidl',
  'Mercadona',
  'Carrefour',
  'Aldi',
  'Costco',
  'Ahorramas',
  'Merkocash',
  'Cualquiera',
];

export const DEFAULT_UNIT_OPTIONS = [
  MeasurementUnit.GRAM,
  MeasurementUnit.KILOGRAM,
  MeasurementUnit.LITER,
  MeasurementUnit.MILLILITER,
  MeasurementUnit.PACKAGE,
  MeasurementUnit.UNIT,
];

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  defaultUnit: 'unit',
  nearExpiryDays: 3,
  compactView: false,
  notificationsEnabled: false,
  notifyOnExpired: false,
  notifyOnLowStock: false,
  lastSyncAt: null,
  locationOptions: [...DEFAULT_LOCATION_OPTIONS],
  categoryOptions: [...DEFAULT_CATEGORY_OPTIONS],
  supermarketOptions: [...DEFAULT_SUPERMARKET_OPTIONS],
  unitOptions: [...DEFAULT_UNIT_OPTIONS],
};

@Injectable({
  providedIn: 'root',
})
export class AppPreferencesService {
  private readonly ready: Promise<void>;
  private cachedDoc: AppPreferencesDoc | null = null;
  private readonly prefersDarkQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  private readonly preferencesSignal = signal<AppPreferences>({ ...DEFAULT_PREFERENCES });
  readonly preferences = computed(() => this.preferencesSignal());

  constructor(
    private readonly storage: StorageService<AppPreferencesDoc>,
  ) {
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
    const normalizedPrefs = this.normalizePreferences(saved);
    this.preferencesSignal.set(normalizedPrefs);
    this.applyTheme(normalizedPrefs.theme);
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const doc = await this.storage.get(STORAGE_KEY);
      if (doc) {
        this.cachedDoc = doc;
        const normalized = this.normalizePreferences(doc);
        this.preferencesSignal.set(normalized);
        this.applyTheme(normalized.theme);
      } else {
        const defaults = { ...DEFAULT_PREFERENCES };
        this.preferencesSignal.set(defaults);
        this.cachedDoc = null;
        this.applyTheme(defaults.theme);
      }
    } catch (err) {
      console.error('[AppPreferencesService] loadFromStorage error', err);
      const defaults = { ...DEFAULT_PREFERENCES };
      this.preferencesSignal.set(defaults);
      this.cachedDoc = null;
      this.applyTheme(defaults.theme);
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
      locationOptions: this.ensureLocationOptions(input?.locationOptions),
      categoryOptions: this.ensureCategoryOptions(input?.categoryOptions),
      supermarketOptions: this.ensureSupermarketOptions(input?.supermarketOptions),
      unitOptions: this.ensureUnitOptions(input?.unitOptions),
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

  private ensureLocationOptions(options?: unknown): string[] {
    if (!Array.isArray(options)) {
      return [...DEFAULT_LOCATION_OPTIONS];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const option of options) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }
    if (!normalized.length) {
      return [...DEFAULT_LOCATION_OPTIONS];
    }
    return normalized;
  }

  private ensureCategoryOptions(options?: unknown): string[] {
    if (!Array.isArray(options)) {
      return [...DEFAULT_CATEGORY_OPTIONS];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const option of options) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }
    if (!normalized.length) {
      return [...DEFAULT_CATEGORY_OPTIONS];
    }
    return normalized;
  }

  private ensureSupermarketOptions(options?: unknown): string[] {
    if (!Array.isArray(options)) {
      return [...DEFAULT_SUPERMARKET_OPTIONS];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const option of options) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }
    if (!normalized.length) {
      return [...DEFAULT_SUPERMARKET_OPTIONS];
    }
    if (!normalized.some(option => option.toLowerCase() === 'otro')) {
      normalized.push('Otro');
    }
    return normalized;
  }

  private ensureUnitOptions(options?: unknown): string[] {
    if (!Array.isArray(options)) {
      return [...DEFAULT_UNIT_OPTIONS];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const option of options) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }
    if (!normalized.length) {
      return [...DEFAULT_UNIT_OPTIONS];
    }
    if (!normalized.some(option => option.toLowerCase() === MeasurementUnit.UNIT.toLowerCase())) {
      normalized.push(MeasurementUnit.UNIT);
    }
    return normalized;
  }
}
