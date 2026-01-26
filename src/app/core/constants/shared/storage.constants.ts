export const DEFAULT_IDS = {
  HOUSEHOLD: 'household:default',
  USER: 'user:local',
} as const;

export const STORAGE_KEYS = {
  PREFERENCES: 'app:preferences',
  PRO_STATUS: 'revenuecat:isPro',
  ONBOARDING_FLAG: 'hasSeenOnboarding',
  SETUP_FLAG: 'hasSeenSetup',
} as const;

export const DOC_TYPES = {
  PREFERENCES: 'app-preferences',
} as const;

export const DATABASE = {
  NAME: 'pantry-db',
} as const;

export const DEFAULT_HOUSEHOLD_ID = DEFAULT_IDS.HOUSEHOLD;
export const DEFAULT_USER_ID = DEFAULT_IDS.USER;
export const STORAGE_KEY_PREFERENCES = STORAGE_KEYS.PREFERENCES;
export const STORAGE_KEY_PRO = STORAGE_KEYS.PRO_STATUS;
export const ONBOARDING_STORAGE_KEY = STORAGE_KEYS.ONBOARDING_FLAG;
export const SETUP_STORAGE_KEY = STORAGE_KEYS.SETUP_FLAG;
export const DOC_TYPE_PREFERENCES = DOC_TYPES.PREFERENCES;
export const APP_DB_NAME = DATABASE.NAME;
