import type { BaseDoc } from '../shared/base-doc.model';

export type AppThemePreference = 'light' | 'dark' | 'system';

export interface AppPreferences {
  theme: AppThemePreference;
  nearExpiryDays: number;
  compactView: boolean;
  notificationsEnabled?: boolean;
  notifyOnExpired?: boolean;
  notifyOnLowStock?: boolean;
  notifyOnNearExpiry?: boolean;
  notificationHour?: number;
  /**
   * Opt-in to anonymous product analytics. Default false — explicit opt-in only.
   * `undefined` = user has not been asked yet (consent flow pending).
   */
  analyticsEnabled?: boolean;
  /** Timestamp (ISO) when consent decision was recorded. Null until asked. */
  analyticsDecidedAt?: string | null;
  lastSyncAt?: string | null;
  locationOptions: string[];
  categoryOptions: string[];
  supermarketOptions: string[];
}
export interface AppPreferencesDoc extends BaseDoc, AppPreferences {}
