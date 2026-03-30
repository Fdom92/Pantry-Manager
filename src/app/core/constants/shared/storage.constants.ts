export const STORAGE_KEYS = {
  PREFERENCES: 'app:preferences',
  PRO_STATUS: 'revenuecat:isPro',
  ONBOARDING_FLAG: 'hasSeenOnboarding',
  REVIEW_FIRST_USE_AT: 'review:firstUseAt',
  REVIEW_LAUNCH_COUNT: 'review:launchCount',
  REVIEW_LAST_PROMPT_AT: 'review:lastPromptAt',
  REVIEW_COMPLETED_AT: 'review:completedAt',
  REVIEW_PRODUCT_ADD_COUNT: 'review:productAddCount',
  REVIEW_CONSUME_COUNT: 'review:consumeCount',
  REVIEW_PENDING: 'review:pending',
} as const;

export const DEFAULT_HOUSEHOLD_ID = 'household:default';

export const DOC_TYPE_PREFERENCES = 'app-preferences';
export const APP_DB_NAME = 'pantry-db';
