/**
 * Canonical analytics event names. Use these constants in all `analytics.track()` calls
 * to avoid typos and to keep PostHog event list clean.
 *
 * Naming convention: `noun_action` (snake_case, past tense for completed actions).
 */
export const ANALYTICS_EVENTS = {
  // Lifecycle
  APP_OPEN: 'app_open',
  /** Fires when the app goes to background (Capacitor `appStateChange.isActive = false`). */
  APP_BACKGROUNDED: 'app_backgrounded',
  /** Fires when the app comes back to foreground. */
  APP_FOREGROUNDED: 'app_foregrounded',

  // In-app update flow (Google Play API).
  APP_UPDATE_CHECK: 'app_update_check',
  APP_UPDATE_AVAILABLE: 'app_update_available',
  APP_UPDATE_STARTED: 'app_update_started',
  APP_UPDATE_COMPLETED: 'app_update_completed',
  APP_UPDATE_FAILED: 'app_update_failed',

  // Onboarding
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',

  // Consent
  ANALYTICS_OPT_IN: 'analytics_opt_in',
  ANALYTICS_OPT_OUT: 'analytics_opt_out',

  // Re-consent sheet (for users who upgraded past onboarding rev).
  RECONSENT_SHEET_SHOWN: 'reconsent_sheet_shown',
  RECONSENT_SHEET_DECIDED: 'reconsent_sheet_decided',

  // Navigation
  TAB_VIEWED: 'tab_viewed',

  // Pantry actions
  PANTRY_ITEM_ADDED: 'pantry_item_added',
  PANTRY_ITEM_CONSUMED: 'pantry_item_consumed',
  PANTRY_ITEM_EDITED: 'pantry_item_edited',
  PANTRY_ITEM_DELETED: 'pantry_item_deleted',
  PANTRY_QUANTITY_ADJUSTED: 'pantry_quantity_adjusted',

  // Pantry modal opens — enable abandonment funnels (opened vs submitted).
  PANTRY_ADD_MODAL_OPENED: 'pantry_add_modal_opened',
  PANTRY_FRESH_ADD_MODAL_OPENED: 'pantry_fresh_add_modal_opened',
  PANTRY_CONSUME_MODAL_OPENED: 'pantry_consume_modal_opened',
  PANTRY_EDIT_MODAL_OPENED: 'pantry_edit_modal_opened',
  PANTRY_BATCHES_MODAL_OPENED: 'pantry_batches_modal_opened',

  // Shopping list
  SHOPPING_BUY_COMPLETED: 'shopping_buy_completed',
  SHOPPING_MANUAL_ADDED: 'shopping_manual_added',
  SHOPPING_ITEM_REMOVED: 'shopping_item_removed',
  SHOPPING_LIST_SHARED: 'shopping_list_shared',

  // Insights / PRO
  INSIGHTS_VIEWED: 'insights_viewed',
  INSIGHTS_PAYWALL_VIEWED: 'insights_paywall_viewed',
  INSIGHTS_PRO_ANALYSIS_TRIGGERED: 'insights_pro_analysis_triggered',
  INSIGHTS_PRO_ANALYSIS_COMPLETED: 'insights_pro_analysis_completed',
  UPGRADE_TAPPED: 'upgrade_tapped',
  UPGRADE_PURCHASE_STARTED: 'upgrade_purchase_started',
  UPGRADE_PURCHASE_COMPLETED: 'upgrade_purchase_completed',
  PRO_TRIAL_CTA_CLICKED: 'pro_trial_cta_clicked',
  PRO_TRIAL_STARTED: 'pro_trial_started',
  PRO_TRIAL_EXPIRED: 'pro_trial_expired',
  WASTE_TRACKER_VIEWED: 'waste_tracker_viewed',
  REPO_PREDICTION_VIEWED: 'repo_prediction_viewed',
  REPO_PREDICTION_ADDED_TO_LIST: 'repo_prediction_added_to_list',

  // Notifications
  NOTIFICATION_SCHEDULED: 'notification_scheduled',
  NOTIFICATION_TAPPED: 'notification_tapped',

  // Preferences (signals of churn / personalization).
  PREFERENCE_CHANGED: 'preference_changed',

  // Retention — streak
  STREAK_REACHED: 'streak_reached',
  STREAK_MILESTONE_3: 'streak_milestone_3',
  STREAK_MILESTONE_7: 'streak_milestone_7',
  STREAK_MILESTONE_30: 'streak_milestone_30',
  STREAK_MILESTONE_100: 'streak_milestone_100',
  STREAK_BROKEN: 'streak_broken',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
