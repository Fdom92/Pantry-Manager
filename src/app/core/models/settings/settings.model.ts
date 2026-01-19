import type { BaseDoc } from '../shared/base-doc.model';

// TYPES
export type AppThemePreference = 'light' | 'dark' | 'system';
export type DefaultUnitPreference = 'kg' | 'g' | 'l' | 'unit';
// INTERFACES
export interface AppPreferences {
  theme: AppThemePreference;
  defaultUnit: DefaultUnitPreference;
  nearExpiryDays: number;
  compactView: boolean;
  notificationsEnabled?: boolean;
  notifyOnExpired?: boolean;
  notifyOnLowStock?: boolean;
  lastSyncAt?: string | null;
  locationOptions: string[];
  categoryOptions: string[];
  supermarketOptions: string[];
  unitOptions: string[];
  plannerMemory?: string;
}
export interface AppPreferencesDoc extends BaseDoc, AppPreferences {}
