export const NOTIFICATION_IDS = {
  EXPIRED_ITEMS: 100,
  NEAR_EXPIRY: 101,
  LOW_STOCK: 110,
  RE_ENGAGEMENT: 120,
  WELCOME: 130,
} as const;

export const NOTIFICATION_CHANNEL_ID = 'pantry-alerts';
export const NOTIFICATION_CHANNEL_NAME = 'Pantry Alerts';
export const DEFAULT_NOTIFICATION_HOUR = 9;

/** Welcome notification fires this long after a user accepts notifs in onboarding. */
export const WELCOME_DELAY_MS = 5 * 60 * 1000;
