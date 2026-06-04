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
  /** Timestamp (ISO) when analytics consent decision was recorded. Null until asked. */
  analyticsDecidedAt?: string | null;
  /**
   * Timestamp (ISO) when the notifications opt-in question was last decided
   * (accept / decline / skip). Null until asked. Used by the re-consent sheet
   * to know whether a user has already been prompted.
   */
  notificationsDecidedAt?: string | null;
  lastSyncAt?: string | null;
  locationOptions: string[];
  categoryOptions: string[];
  supermarketOptions: string[];
}
export interface AppPreferencesDoc extends BaseDoc, AppPreferences {}
