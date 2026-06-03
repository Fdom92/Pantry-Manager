/**
 * Storage keys used across the app, split between two backends:
 *
 * - **PouchDB** (offline-first user data — survives backup/restore):
 *     `PREFERENCES` is a PouchDB document `_id`, NOT a localStorage key.
 *     Anything the user "owns" (pantry items, batches, prefs, history) belongs
 *     here so the JSON backup export captures it.
 *
 * - **localStorage** (per-device state — intentionally lost on reinstall/wipe):
 *     Caches, one-shot flags, review counters, onboarding flags, RevenueCat
 *     identifiers. Read synchronously at boot before PouchDB is ready. Never
 *     put user-facing data here — it will not be exported with the backup.
 *
 * Rule of thumb when adding a new key:
 *   "Should the user see this restored on a fresh install + import?"
 *     yes → PouchDB doc id
 *     no  → localStorage key
 */
export const STORAGE_KEYS = {
  // ── PouchDB document ids ──────────────────────────────────────────────
  /** PouchDB `_id` for the singleton `AppPreferences` doc. */
  PREFERENCES: 'app:preferences',

  // ── localStorage keys (per-device state) ──────────────────────────────
  /** Cached PRO entitlement. Authoritative source is RevenueCat cloud. */
  PRO_STATUS: 'revenuecat:isPro',
  /** Stable anon user id used to init the RevenueCat SDK at boot. */
  REVENUECAT_USER_ID: 'revenuecat:userId',
  /** Onboarding completion flag. Read synchronously in `AppComponent` for routing. */
  ONBOARDING_FLAG: 'hasSeenOnboarding',
  // Review prompt cadence (per-device — does not transfer in backup).
  REVIEW_FIRST_USE_AT: 'review:firstUseAt',
  REVIEW_LAUNCH_COUNT: 'review:launchCount',
  REVIEW_LAST_PROMPT_AT: 'review:lastPromptAt',
  REVIEW_COMPLETED_AT: 'review:completedAt',
  REVIEW_PRODUCT_ADD_COUNT: 'review:productAddCount',
  REVIEW_CONSUME_COUNT: 'review:consumeCount',
  REVIEW_PENDING: 'review:pending',
  /** Set once the post-update re-consent sheet has been shown (one-shot). */
  RECONSENT_SHOWN: 'reconsent:shown',
  /**
   * Mirror of `AppPreferences.analyticsEnabled` kept in localStorage so the
   * Sentry SDK — initialised synchronously in `main.ts` before Angular boots
   * and PouchDB is ready — can decide whether to forward events.
   */
  ERROR_REPORTING_ENABLED: 'errorReporting:enabled',
} as const;

export const DEFAULT_HOUSEHOLD_ID = 'household:default';

export const DOC_TYPE_PREFERENCES = 'app-preferences';
export const APP_DB_NAME = 'pantry-db';
