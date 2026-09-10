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
  /**
   * Which verb the user actually meant when deleting a product that still had
   * stock. Measures whether the 5.4 prompt converts thrown-away history into
   * recorded consumption, or whether people genuinely wanted it gone.
   */
  PANTRY_DELETE_INTENT_RESOLVED: 'pantry_delete_intent_resolved',

  // Pantry modal opens — enable abandonment funnels (opened vs submitted).
  PANTRY_ADD_MODAL_OPENED: 'pantry_add_modal_opened',
  PANTRY_FRESH_ADD_MODAL_OPENED: 'pantry_fresh_add_modal_opened',
  /**
   * One per save of either add modal, despensa or fresh. pantry_item_added
   * fires once per product, so "opened vs added" was never a funnel — one save
   * of five products counted as five. These two are the real pair.
   */
  PANTRY_ADD_SUBMITTED: 'pantry_add_submitted',
  PANTRY_ADD_MODAL_ABANDONED: 'pantry_add_modal_abandoned',
  /**
   * A fresh product moved between sufficient / low / none from its card. The
   * fridge's consumption gesture, logged to history but invisible to
   * analytics until 5.4.
   */
  PANTRY_FRESH_STATE_CHANGED: 'pantry_fresh_state_changed',
  PANTRY_CONSUME_MODAL_OPENED: 'pantry_consume_modal_opened',
  PANTRY_EDIT_MODAL_OPENED: 'pantry_edit_modal_opened',
  PANTRY_BATCHES_MODAL_OPENED: 'pantry_batches_modal_opened',
  PANTRY_PENDIENTES_SHEET_OPENED: 'pantry_pendientes_sheet_opened',
  PANTRY_PENDIENTES_SAVED: 'pantry_pendientes_saved',
  /**
   * The quantity sheet is the path people actually consume through, and until
   * 5.4 it only reported successful adjustments — no denominator, so a sheet
   * opened and closed untouched was invisible.
   */
  PANTRY_QUANTITY_SHEET_OPENED: 'pantry_quantity_sheet_opened',
  /**
   * Consume-flow drop-off. The 30-day export had 5 consume modals opened by 5
   * different people and 0 items consumed; these two say whether they leave
   * before picking anything or after picking and thinking better of it.
   */
  PANTRY_CONSUME_ENTRY_ADDED: 'pantry_consume_entry_added',
  PANTRY_CONSUME_MODAL_ABANDONED: 'pantry_consume_modal_abandoned',
  /**
   * What people do inside the pantry tab. It draws more views than any other
   * (74 of 194 in the 30-day export) and was, until 5.4, a black box: we knew
   * they went there and nothing about what they did once inside.
   */
  PANTRY_SEARCH_USED: 'pantry_search_used',
  PANTRY_FILTER_APPLIED: 'pantry_filter_applied',
  PANTRY_GROUPING_TOGGLED: 'pantry_grouping_toggled',
  /**
   * Shown when a screen has nothing to render. 18 of 24 users never came back
   * after one session; this says how many of them were staring at an empty app.
   */
  EMPTY_STATE_SHOWN: 'empty_state_shown',

  // Dashboard
  /** "Not now" on the HOY suggestion or on one of the action cards. */
  DASHBOARD_SUGGESTION_DISMISSED: 'dashboard_suggestion_dismissed',

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
  /**
   * The purchase sheet closed without a purchase. Only completions were
   * recorded before, so someone reaching the store sheet and backing out left
   * no trace. reason: cancelled | failed | unavailable.
   */
  UPGRADE_PURCHASE_FAILED: 'upgrade_purchase_failed',
  UPGRADE_RESTORE_TAPPED: 'upgrade_restore_tapped',
  PRO_TRIAL_CTA_CLICKED: 'pro_trial_cta_clicked',
  /** Tap anywhere on a locked PRO teaser card (navigates to /upgrade). */
  PAYWALL_CARD_CLICKED: 'paywall_card_clicked',
  PRO_TRIAL_STARTED: 'pro_trial_started',
  PRO_TRIAL_EXPIRED: 'pro_trial_expired',
  WASTE_TRACKER_VIEWED: 'waste_tracker_viewed',
  REPO_PREDICTION_VIEWED: 'repo_prediction_viewed',
  REPO_PREDICTION_ADDED_TO_LIST: 'repo_prediction_added_to_list',

  // Receipt scan (feat 5.1)
  RECEIPT_SCAN_STARTED: 'receipt_scan_started',
  RECEIPT_SCAN_COMPLETED: 'receipt_scan_completed',
  RECEIPT_SCAN_FAILED: 'receipt_scan_failed',
  RECEIPT_LINE_EDITED: 'receipt_line_edited',
  // Funnel between started and completed (5.4). Without these, a scan that
  // dies mid-flow is indistinguishable from one that never began: the 5.1-5.3
  // data showed 11 starts, 0 completions and 0 failures, with no way to tell
  // whether the camera, the OCR, the parser or the submit was at fault.
  RECEIPT_PHOTO_CAPTURED: 'receipt_photo_captured',
  RECEIPT_OCR_FINISHED: 'receipt_ocr_finished',
  RECEIPT_PARSE_FINISHED: 'receipt_parse_finished',
  RECEIPT_REVIEW_OPENED: 'receipt_review_opened',
  RECEIPT_SUBMIT_PRESSED: 'receipt_submit_pressed',
  /**
   * The review sheet closed with nothing saved. This is the event that tells
   * a broken scanner apart from a working one people give up on: both leave
   * a lone receipt_scan_started behind, which is all 5.1-5.3 ever recorded.
   */
  RECEIPT_REVIEW_ABANDONED: 'receipt_review_abandoned',

  // Notifications
  NOTIFICATION_SCHEDULED: 'notification_scheduled',
  /**
   * Delivery, as opposed to engagement. 124 scheduled and 0 tapped over 30
   * days could mean the OS never fired them or that nobody cared, and those
   * two call for opposite fixes.
   */
  NOTIFICATION_RECEIVED: 'notification_received',
  NOTIFICATION_TAPPED: 'notification_tapped',

  // Preferences (signals of churn / personalization).
  PREFERENCE_CHANGED: 'preference_changed',

  // Retention — streak
  STREAK_REACHED: 'streak_reached',
  STREAK_MILESTONE_3: 'streak_milestone_3',
  STREAK_MILESTONE_7: 'streak_milestone_7',
  STREAK_MILESTONE_14: 'streak_milestone_14',
  STREAK_MILESTONE_30: 'streak_milestone_30',
  STREAK_BROKEN: 'streak_broken',

  // Retention — coach marks
  COACH_MARK_SHOWN: 'coach_mark_shown',
  /** User tapped the backdrop to dismiss without using the CTA. */
  COACH_MARK_DISMISSED: 'coach_mark_dismissed',
  /** User tapped the CTA inside the coach mark — opens add modal. */
  COACH_MARK_TAPPED: 'coach_mark_tapped',
} as const;

