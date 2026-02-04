import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { MeasurementUnit } from '@core/models/shared';
import type { AppPreferences } from '@core/models/settings';

export const TOAST_DURATION = 1800;
export const UNASSIGNED_LOCATION_KEY = 'unassigned';
export const UNASSIGNED_PRODUCT_NAME = 'Product';
export const DEFAULT_UNIT_OPTIONS = [
  MeasurementUnit.GRAM,
  MeasurementUnit.KILOGRAM,
  MeasurementUnit.LITER,
  MeasurementUnit.MILLILITER,
  MeasurementUnit.PACKAGE,
  MeasurementUnit.UNIT,
];

export const DEFAULT_OPTION_SETS = {
  UNITS: DEFAULT_UNIT_OPTIONS,
} as const;

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  defaultUnit: 'unit',
  nearExpiryDays: NEAR_EXPIRY_WINDOW_DAYS,
  compactView: false,
  notificationsEnabled: false,
  notifyOnExpired: false,
  notifyOnLowStock: false,
  lastSyncAt: null,
  locationOptions: [],
  categoryOptions: [],
  supermarketOptions: [],
  unitOptions: [...DEFAULT_UNIT_OPTIONS],
  plannerMemory: '',
};
