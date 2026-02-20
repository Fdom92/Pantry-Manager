import type { AppPreferences } from '@core/models/settings';

/**
 * Time window constants (in days) used across the application
 */
export const NEAR_EXPIRY_WINDOW_DAYS = 15;
export const RECENTLY_ADDED_WINDOW_DAYS = 7;
export const PENDING_REVIEW_STALE_DAYS = 7;

export const UNASSIGNED_LOCATION_KEY = 'unassigned';
export const UNASSIGNED_PRODUCT_NAME = 'Product';
export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
  compactView: false,
  notificationsEnabled: false,
  notifyOnExpired: false,
  notifyOnLowStock: false,
  lastSyncAt: null,
  locationOptions: [],
  categoryOptions: [],
  supermarketOptions: [],
  plannerMemory: '',
};
