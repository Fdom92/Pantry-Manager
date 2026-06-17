export const NOTIFICATION_IDS = {
  EXPIRED_ITEMS: 100,
  NEAR_EXPIRY: 101,
  LOW_STOCK: 110,
  RE_ENGAGEMENT: 120,
  WELCOME: 130,
  /** Outside the priority registry — scheduled ad-hoc on milestone. */
  STREAK_MILESTONE: 150,
  /** Projected pantry-state notifications for days 1–7 ahead. */
  PROJECTED_DAY_1: 200,
  PROJECTED_DAY_2: 201,
  PROJECTED_DAY_3: 202,
  PROJECTED_DAY_4: 203,
  PROJECTED_DAY_5: 204,
  PROJECTED_DAY_6: 205,
  PROJECTED_DAY_7: 206,
} as const;

export const NOTIFICATION_CHANNEL_ID = 'pantry-alerts';
export const NOTIFICATION_CHANNEL_NAME = 'Pantry Alerts';
export const DEFAULT_NOTIFICATION_HOUR = 9;

/** Welcome notification fires this long after a user accepts notifs in onboarding. */
export const WELCOME_DELAY_MS = 5 * 60 * 1000;

/** All projected notification IDs — cancelled and rescheduled on every app open. */
export const PROJECTED_NOTIFICATION_IDS = [
  NOTIFICATION_IDS.PROJECTED_DAY_1,
  NOTIFICATION_IDS.PROJECTED_DAY_2,
  NOTIFICATION_IDS.PROJECTED_DAY_3,
  NOTIFICATION_IDS.PROJECTED_DAY_4,
  NOTIFICATION_IDS.PROJECTED_DAY_5,
  NOTIFICATION_IDS.PROJECTED_DAY_6,
  NOTIFICATION_IDS.PROJECTED_DAY_7,
] as const;
