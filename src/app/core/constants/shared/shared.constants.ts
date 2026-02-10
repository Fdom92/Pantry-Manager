import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import type { AppPreferences } from '@core/models/settings';

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
