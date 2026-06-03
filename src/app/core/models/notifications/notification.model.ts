import type { PantryItem } from '@core/models/pantry';
import type { AppPreferences } from '@core/models/settings';

export interface NotificationContext {
  items: PantryItem[];
  preferences: AppPreferences;
  t: (key: string, params?: Record<string, unknown>) => string;
  now: Date;
}

export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  scheduleAt: string;
  /** Arbitrary payload passed to the OS so the tap handler can read it back. */
  extra?: Record<string, unknown>;
}

export interface NotificationDefinition {
  readonly id: number;
  readonly priority: number;
  isEnabled(preferences: AppPreferences): boolean;
  build(context: NotificationContext): ScheduledNotification | null;
}
