export const NOTIFICATION_IDS = {
  EXPIRED_ITEMS: 100,
  NEAR_EXPIRY: 101,
  LOW_STOCK: 110,
  RE_ENGAGEMENT: 120,
  WELCOME: 130,
  RECOVERY_D2: 140,
  RECOVERY_D5: 141,
  RECOVERY_D10: 142,
} as const;

export const NOTIFICATION_CHANNEL_ID = 'pantry-alerts';
export const NOTIFICATION_CHANNEL_NAME = 'Pantry Alerts';
export const DEFAULT_NOTIFICATION_HOUR = 9;

/** Welcome notification fires this long after a user accepts notifs in onboarding. */
export const WELCOME_DELAY_MS = 5 * 60 * 1000;

/** Recovery push window — silent escalating nudges after onboarding. */
export const RECOVERY_OFFSETS_DAYS = [2, 5, 10] as const;
export const RECOVERY_NOTIFICATION_IDS = [
  NOTIFICATION_IDS.RECOVERY_D2,
  NOTIFICATION_IDS.RECOVERY_D5,
  NOTIFICATION_IDS.RECOVERY_D10,
] as const;

export type RecoverySlot = 'd2' | 'd5' | 'd10';
