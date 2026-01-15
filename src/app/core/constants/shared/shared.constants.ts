import { AppPreferences, MeasurementUnit } from "@core/models";

export const TOAST_DURATION = 1800;
export const UNASSIGNED_LOCATION_KEY = 'unassigned';
export const UNASSIGNED_PRODUCT_NAME = 'Product';
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

export const DEFAULT_OPTION_SETS = {
  LOCATIONS: DEFAULT_LOCATION_OPTIONS,
  CATEGORIES: DEFAULT_CATEGORY_OPTIONS,
  SUPERMARKETS: DEFAULT_SUPERMARKET_OPTIONS,
  UNITS: DEFAULT_UNIT_OPTIONS,
} as const;

export const DEFAULT_PREFERENCES: AppPreferences = {
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
  plannerMemory: '',
};
