import { BaseDoc } from "../shared";

export type AppThemePreference = 'light' | 'dark' | 'system';
export type DefaultUnitPreference = 'kg' | 'g' | 'l' | 'unit';

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
