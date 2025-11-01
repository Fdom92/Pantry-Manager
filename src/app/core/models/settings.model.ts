import { BaseDoc } from './base-doc.model';

export type AppThemePreference = 'light' | 'dark' | 'system';
export type DefaultUnitPreference = 'kg' | 'g' | 'l' | 'unit';

export interface UserSettings {
  username: string;
  householdName: string;
  favoriteSupermarket?: string;
}

export interface UserSettingsDoc extends BaseDoc, UserSettings {}

export interface AppPreferences {
  theme: AppThemePreference;
  defaultUnit: DefaultUnitPreference;
  nearExpiryDays: number;
  compactView: boolean;
  notificationsEnabled?: boolean;
  notifyOnExpired?: boolean;
  notifyOnLowStock?: boolean;
  lastSyncAt?: string | null;
}

export interface AppPreferencesDoc extends BaseDoc, AppPreferences {}
