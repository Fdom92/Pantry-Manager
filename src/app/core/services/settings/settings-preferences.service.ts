import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  DEFAULT_PREFERENCES,
  DOC_TYPE_PREFERENCES,
  NEAR_EXPIRY_WINDOW_DAYS,
  STORAGE_KEYS,
} from '@core/constants';
import {
  AppPreferences,
  AppPreferencesDoc,
  AppThemePreference,
} from '@core/models';
import { normalizeStringList } from '@core/utils/normalization.util';
import { StorageService } from '../shared/storage.service';
import { LoggerService } from '../shared/logger.service';
import { SystemBarsService, THEME_FADE_MS } from '../shared/system-bars.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsPreferencesService {
  private readonly storage = inject<StorageService<AppPreferencesDoc>>(StorageService);
  private readonly logger = inject(LoggerService);
  private readonly systemBars = inject(SystemBarsService);

  private readonly ready: Promise<void>;
  private cachedDoc: AppPreferencesDoc | null = null;
  private readonly prefersDarkQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  private readonly preferencesSignal = signal<AppPreferences>({ ...DEFAULT_PREFERENCES });

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
      _id: STORAGE_KEYS.PREFERENCES,
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
    this.applyTheme(normalizedPrefs.theme, undefined, true);
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const doc = await this.storage.get(STORAGE_KEYS.PREFERENCES);
      if (doc) {
        this.cachedDoc = doc;
        const normalized = this.normalizePreferences(doc);
        this.preferencesSignal.set(normalized);
        this.applyTheme(normalized.theme);
      } else {
        this.applyDefaults();
      }
    } catch (err) {
      this.logger.error('SettingsPreferencesService', 'loadFromStorage error', err);
      this.applyDefaults();
    }
  }

  private normalizePreferences(input?: Partial<AppPreferences>): AppPreferences {
    return {
      theme: this.ensureTheme(input?.theme),
      nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
      compactView: Boolean(input?.compactView),
      notificationsEnabled: Boolean(input?.notificationsEnabled),
      notifyOnExpired: Boolean(input?.notifyOnExpired),
      notifyOnLowStock: Boolean(input?.notifyOnLowStock),
      notifyOnNearExpiry: Boolean(input?.notifyOnNearExpiry),
      notificationHour: this.ensureNotificationHour(input?.notificationHour),
      analyticsEnabled: typeof input?.analyticsEnabled === 'boolean' ? input.analyticsEnabled : undefined,
      analyticsDecidedAt: input?.analyticsDecidedAt ?? null,
      notificationsDecidedAt: input?.notificationsDecidedAt ?? null,
      lastSyncAt: input?.lastSyncAt ?? null,
      locationOptions: this.ensureOptions(input?.locationOptions),
      categoryOptions: this.ensureOptions(input?.categoryOptions),
      supermarketOptions: this.ensureOptions(input?.supermarketOptions),
    };
  }

  private ensureNotificationHour(value?: unknown): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 9;
  }

  private ensureTheme(theme?: string): AppThemePreference {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      return theme;
    }
    return DEFAULT_PREFERENCES.theme;
  }

  /**
   * `animate` is for a change the user is looking at (Settings, the system flipping while the
   * app is open), not for the first paint: the switch cross-fades instead of snapping, and the
   * system-bar strips fade over the same time so the app and its bars move as one.
   */
  private applyTheme(theme: AppThemePreference, systemPrefersDark?: boolean, animate = false): void {
    if (typeof document === 'undefined') {
      return;
    }
    const prefersDark = systemPrefersDark ?? this.prefersDarkQuery?.matches ?? false;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    const root = document.documentElement;
    const apply = () => {
      root.classList.toggle('ion-palette-dark', useDark);
      root.classList.toggle('dark', useDark);
      root.setAttribute('data-theme', useDark ? 'dark' : 'light');
      root.style.setProperty('color-scheme', useDark ? 'dark' : 'light');
    };

    const changes = root.classList.contains('ion-palette-dark') !== useDark;
    const startTransition = (document as Document & { startViewTransition?: (cb: () => void) => unknown })
      .startViewTransition;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!animate || !changes || !Capacitor.isNativePlatform() || typeof startTransition !== 'function' || reducedMotion) {
      apply();
      return;
    }
    this.systemBars.expectFade(THEME_FADE_MS);
    try {
      startTransition.call(document, apply);
    } catch {
      apply();
    }
  }

  private setupSystemThemeListener(): void {
    if (!this.prefersDarkQuery) {
      return;
    }
    const listener = (event: MediaQueryListEvent) => {
      if (this.preferencesSignal().theme === 'system') {
        this.applyTheme('system', event.matches, true);
      }
    };

    if (typeof this.prefersDarkQuery.addEventListener === 'function') {
      this.prefersDarkQuery.addEventListener('change', listener);
    } else if (typeof this.prefersDarkQuery.addListener === 'function') {
      this.prefersDarkQuery.addListener(listener);
    }
  }

  /** Every catalog stores a plain string list and validates the same way. */
  private ensureOptions(options?: unknown): string[] {
    return normalizeStringList(options, {
      fallback: [],
    });
  }

  private applyDefaults(): void {
    const defaults = { ...DEFAULT_PREFERENCES };
    this.preferencesSignal.set(defaults);
    this.cachedDoc = null;
    this.applyTheme(defaults.theme);
  }
}
