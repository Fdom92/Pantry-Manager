import type { BaseDoc } from '../shared/base-doc.model';

// TYPES
export type AppThemePreference = 'light' | 'dark' | 'system';
// INTERFACES
export interface AppPreferences {
  theme: AppThemePreference;
  nearExpiryDays: number;
  compactView: boolean;
  notificationsEnabled?: boolean;
  notifyOnExpired?: boolean;
  notifyOnLowStock?: boolean;
  lastSyncAt?: string | null;
  locationOptions: string[];
  categoryOptions: string[];
  supermarketOptions: string[];
  plannerMemory?: string;
}
export interface AppPreferencesDoc extends BaseDoc, AppPreferences {}
