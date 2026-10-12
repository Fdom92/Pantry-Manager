import type { AppPreferences } from '@core/models/settings';

/**
 * Time window constants (in days) used across the application
 */
export const NEAR_EXPIRY_WINDOW_DAYS = 15;
export const RECENTLY_ADDED_WINDOW_DAYS = 7;

export const UNASSIGNED_LOCATION_KEY = 'unassigned';
export const UNASSIGNED_PRODUCT_NAME = 'Product';
export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
  compactView: false,
  notificationsEnabled: false,
  notifyOnExpired: false,
  notifyOnLowStock: false,
  notifyOnNearExpiry: false,
  notificationHour: 9,
  analyticsEnabled: false,
  analyticsDecidedAt: null,
  notificationsDecidedAt: null,
  lastSyncAt: null,
  locationOptions: [],
  categoryOptions: [],
  supermarketOptions: [],
};

/**
 * How long after a sheet starts to open its search/name field is focused. Focusing once
 * the slide-in finishes made the keyboard and the WebView resize land as a second, abrupt
 * motion; starting it with the sheet (after a beat, so the field exists and is laid out)
 * lets the two blend into one. Raise it if the keyboard ever fights the slide-in.
 */
export const SHEET_AUTOFOCUS_DELAY_MS = 80;
