import { TestBed } from '@angular/core/testing';
import { SettingsPreferencesService } from './settings-preferences.service';
import { StorageService } from '../shared/storage.service';
import { DEFAULT_PREFERENCES, NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import type { AppPreferencesDoc } from '@core/models';

describe('SettingsPreferencesService', () => {
  let service: SettingsPreferencesService;
  let storageSpy: jasmine.SpyObj<StorageService<any>>;

  beforeEach(() => {
    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: false,
        addEventListener: () => {},
        addListener: () => {},
        removeEventListener: () => {},
      }),
      writable: true,
    });

    storageSpy = jasmine.createSpyObj('StorageService', ['save', 'get']);
    storageSpy.get.and.returnValue(Promise.resolve(null));

    // Default save returns a properly structured document
    const defaultDoc: AppPreferencesDoc = {
      _id: 'preferences',
      type: 'preferences',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      theme: 'system',
      nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
      compactView: false,
      notificationsEnabled: false,
      notifyOnExpired: false,
      notifyOnLowStock: false,
      notifyOnNearExpiry: false,
      notificationHour: 9,
      lastSyncAt: null,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    } as any;
    storageSpy.save.and.callFake((doc: AppPreferencesDoc) => Promise.resolve(doc));

    TestBed.configureTestingModule({
      providers: [
        SettingsPreferencesService,
        { provide: StorageService, useValue: storageSpy },
      ],
    });
    service = TestBed.inject(SettingsPreferencesService);
  });

  // ── ensureTheme ────────────────────────────────────────────────────────────

  describe('theme validation (ensureTheme)', () => {
    it('accepts "light"', async () => {
      await service.savePreferences({ theme: 'light' } as any);
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe('light');
    });

    it('accepts "dark"', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe('dark');
    });

    it('accepts "system"', async () => {
      await service.savePreferences({ theme: 'system' } as any);
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe('system');
    });

    it('falls back to DEFAULT_PREFERENCES.theme for invalid input', async () => {
      await service.savePreferences({ theme: 'invalid' } as any);
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe(DEFAULT_PREFERENCES.theme);
    });

    it('falls back to DEFAULT_PREFERENCES.theme for undefined', async () => {
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe(DEFAULT_PREFERENCES.theme);
    });
  });

  // ── ensureNotificationHour ─────────────────────────────────────────────────

  describe('notificationHour validation (ensureNotificationHour)', () => {
    it('accepts 0', async () => {
      await service.savePreferences({ notificationHour: 0 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(0);
    });

    it('accepts 23', async () => {
      await service.savePreferences({ notificationHour: 23 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(23);
    });

    it('falls back to 9 for negative numbers', async () => {
      await service.savePreferences({ notificationHour: -1 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(9);
    });

    it('falls back to 9 for numbers > 23', async () => {
      await service.savePreferences({ notificationHour: 24 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(9);
    });

    it('falls back to 9 for NaN', async () => {
      await service.savePreferences({ notificationHour: NaN } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(9);
    });

    it('falls back to 9 for non-integer', async () => {
      await service.savePreferences({ notificationHour: 9.5 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.notificationHour).toBe(9);
    });
  });

  // ── normalizePreferences ───────────────────────────────────────────────────

  describe('normalizePreferences', () => {
    it('nearExpiryDays is always set to NEAR_EXPIRY_WINDOW_DAYS (immutable)', async () => {
      await service.savePreferences({ nearExpiryDays: 999 } as any);
      const prefs = await service.getPreferences();
      expect(prefs.nearExpiryDays).toBe(NEAR_EXPIRY_WINDOW_DAYS);
    });

    it('boolean fields default to false', async () => {
      await service.savePreferences({
        compactView: undefined as any,
        notificationsEnabled: undefined as any,
      } as any);
      const prefs = await service.getPreferences();
      expect(prefs.compactView).toBe(false);
      expect(prefs.notificationsEnabled).toBe(false);
    });

    it('Boolean() coercion converts truthy to true', async () => {
      await service.savePreferences({ compactView: 'anything' } as any);
      const prefs = await service.getPreferences();
      expect(prefs.compactView).toBe(true);
    });

    it('preserves lastSyncAt if provided', async () => {
      const timestamp = '2026-05-28T12:00:00Z';
      await service.savePreferences({ lastSyncAt: timestamp } as any);
      const prefs = await service.getPreferences();
      expect(prefs.lastSyncAt).toBe(timestamp);
    });

    it('locationOptions defaults to empty array', async () => {
      const prefs = await service.getPreferences();
      expect(prefs.locationOptions).toEqual([]);
    });
  });

  // ── savePreferences ────────────────────────────────────────────────────────

  describe('savePreferences', () => {
    it('merges incoming prefs over existing signal', async () => {
      await service.savePreferences({ compactView: true } as any);
      storageSpy.save.calls.reset();
      await service.savePreferences({ notificationsEnabled: true } as any);
      const prefs = await service.getPreferences();
      expect(prefs.compactView).toBe(true);
      expect(prefs.notificationsEnabled).toBe(true);
    });

    it('calls storage.save with normalized doc', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      expect(storageSpy.save).toHaveBeenCalled();
      const doc = storageSpy.save.calls.mostRecent().args[0] as AppPreferencesDoc;
      expect(doc.theme).toBe('dark');
      expect(doc.nearExpiryDays).toBe(NEAR_EXPIRY_WINDOW_DAYS);
    });

    it('preserves createdAt from cachedDoc', async () => {
      const createdAt = '2026-01-01T00:00:00Z';
      const savedDoc: AppPreferencesDoc = {
        _id: 'preferences',
        type: 'preferences',
        createdAt,
        updatedAt: new Date().toISOString(),
        theme: 'light',
        nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
        compactView: false,
        notificationsEnabled: false,
        notifyOnExpired: false,
        notifyOnLowStock: false,
        notifyOnNearExpiry: false,
        notificationHour: 9,
        lastSyncAt: null,
        locationOptions: [],
        categoryOptions: [],
        supermarketOptions: [],
      } as any;
      storageSpy.save.and.returnValue(Promise.resolve(savedDoc));

      // First save to cache the doc
      await service.savePreferences({} as any);

      storageSpy.save.calls.reset();
      storageSpy.save.and.returnValue(Promise.resolve(savedDoc));

      // Second save should preserve createdAt
      await service.savePreferences({ theme: 'dark' } as any);

      const doc = storageSpy.save.calls.mostRecent().args[0] as AppPreferencesDoc;
      expect(doc.createdAt).toBe(createdAt);
    });

    it('updates preferencesSignal after save', async () => {
      storageSpy.save.and.returnValue(
        Promise.resolve({
          theme: 'dark',
          nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
          compactView: true,
          notificationsEnabled: false,
          notifyOnExpired: false,
          notifyOnLowStock: false,
          notifyOnNearExpiry: false,
          notificationHour: 15,
          lastSyncAt: null,
          locationOptions: [],
          categoryOptions: [],
          supermarketOptions: [],
        } as any)
      );

      await service.savePreferences({} as any);
      const prefs = await service.getPreferences();
      expect(prefs.theme).toBe('dark');
      expect(prefs.compactView).toBe(true);
      expect(prefs.notificationHour).toBe(15);
    });
  });

  // ── getPreferences ─────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('awaits ready before returning', async () => {
      const prefs = await service.getPreferences();
      expect(prefs).toBeDefined();
      expect(prefs.theme).toBeDefined();
    });

    it('returns current preferences signal value', async () => {
      const prefs = await service.getPreferences();
      expect(prefs.nearExpiryDays).toBe(NEAR_EXPIRY_WINDOW_DAYS);
      expect(prefs.notificationHour).toBe(9);
    });
  });

  // ── reload ─────────────────────────────────────────────────────────────────

  describe('reload', () => {
    it('refreshes from storage', async () => {
      const newDoc: AppPreferencesDoc = {
        _id: 'preferences',
        type: 'preferences',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        theme: 'dark',
        nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
        compactView: true,
        notificationsEnabled: false,
        notifyOnExpired: false,
        notifyOnLowStock: false,
        notifyOnNearExpiry: false,
        notificationHour: 12,
        lastSyncAt: null,
        locationOptions: [],
        categoryOptions: [],
        supermarketOptions: [],
      } as any;
      storageSpy.get.and.returnValue(Promise.resolve(newDoc));

      const prefs = await service.reload();
      expect(prefs.theme).toBe('dark');
      expect(prefs.compactView).toBe(true);
      expect(prefs.notificationHour).toBe(12);
    });
  });

  // ── applyTheme ─────────────────────────────────────────────────────────────

  describe('applyTheme (DOM manipulation)', () => {
    it('sets data-theme attribute to "dark" for dark theme', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('sets data-theme attribute to "light" for light theme', async () => {
      await service.savePreferences({ theme: 'light' } as any);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('toggles ion-palette-dark class for dark theme', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);

      await service.savePreferences({ theme: 'light' } as any);
      expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(false);
    });

    it('toggles dark class', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      await service.savePreferences({ theme: 'light' } as any);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('sets color-scheme CSS property', async () => {
      await service.savePreferences({ theme: 'dark' } as any);
      expect(document.documentElement.style.colorScheme).toBe('dark');

      await service.savePreferences({ theme: 'light' } as any);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });
});
