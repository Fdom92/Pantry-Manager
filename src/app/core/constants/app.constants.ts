import { AppPreferences, ItemLocationStock, MeasurementUnit, UserSettings } from "@core/models";

export const DEFAULT_HOUSEHOLD_ID = 'household:default';
export const DEFAULT_USER_ID = 'user:local';
export const STORAGE_KEY_SETTINGS = 'user:settings';
export const DOC_TYPE_SETTINGS = 'user-settings';
export const STORAGE_KEY_PREFERENCES = 'app:preferences';
export const DOC_TYPE_PREFERENCES = 'app-preferences';
export const STORAGE_KEY_PRO = 'revenuecat:isPro';
export const APP_DB_NAME = 'pantry-db';
export const ONBOARDING_STORAGE_KEY = 'hasSeenOnboarding';
export const NEAR_EXPIRY_WINDOW_DAYS = 15;
export const TOAST_DURATION = 1800;
export const DEFAULT_SETTINGS: UserSettings = {
  username: '',
  householdName: '',
  favoriteSupermarket: '',
};
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
};
export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it';
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'es', 'fr', 'de', 'pt', 'it'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
  it: 'it-IT',
};
export type LegacyLocationStock = ItemLocationStock & { minThreshold?: number | null };
