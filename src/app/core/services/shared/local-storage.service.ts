import { Injectable } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants';

/**
 * Typed, grouped facade over `window.localStorage`.
 *
 * Why this exists:
 * - Every reader/writer of localStorage went through a raw string key + manual
 *   serialization. Easy to drift (typos, inconsistent number/date parsing,
 *   missed migrations).
 * - Grouping by domain (`onboarding`, `pro`, `review`, …) makes call sites
 *   self-documenting and limits the blast radius if we ever swap localStorage
 *   for `@capacitor/preferences` or another store.
 * - All known keys are declared in `STORAGE_KEYS`; this service is the *only*
 *   place that knows how to encode each one.
 *
 * Storage layout (all per-device, lost on reinstall — that is intentional,
 * see `STORAGE_KEYS` doc comment for the PouchDB vs localStorage decision rule):
 *
 *   onboarding       ─ booleans for first-run / re-consent flags
 *   pro              ─ cached PRO status from RevenueCat
 *   revenuecat       ─ stable anon user id
 *   errorReporting   ─ mirror of analyticsEnabled used by Sentry beforeSend
 *   review           ─ in-app review prompt cadence counters & dates
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageService {

  // ─── Onboarding & re-consent flags ─────────────────────────────────────
  readonly onboarding = {
    isSeen: () => this.getBool(STORAGE_KEYS.ONBOARDING_FLAG),
    setSeen: (v: boolean) => this.setBool(STORAGE_KEYS.ONBOARDING_FLAG, v),
    /** Wipe both onboarding and re-consent flags — used by Dev "Reset onboarding". */
    reset: () => {
      this.remove(STORAGE_KEYS.ONBOARDING_FLAG);
      this.remove(STORAGE_KEYS.RECONSENT_SHOWN);
    },
  };

  readonly reconsent = {
    isShown: () => this.getBool(STORAGE_KEYS.RECONSENT_SHOWN),
    markShown: () => this.setBool(STORAGE_KEYS.RECONSENT_SHOWN, true),
  };

  // ─── PRO entitlement cache + trial flags ───────────────────────────────
  // Authoritative source is RevenueCat cloud; this is a sync cache read at
  // boot before the SDK has rehydrated. Trial flags are local one-shots used
  // by AppComponent to detect trial expiry and emit the analytics event once.
  readonly pro = {
    getStatus: (): boolean | null => this.getJson<boolean>(STORAGE_KEYS.PRO_STATUS),
    setStatus: (v: boolean) => this.setJson(STORAGE_KEYS.PRO_STATUS, v),

    getTrialStartedAt: () => this.getDate(STORAGE_KEYS.PRO_TRIAL_STARTED_AT),
    setTrialStartedAt: (v: Date | string) => this.setDate(STORAGE_KEYS.PRO_TRIAL_STARTED_AT, v),

    isTrialExpiredFired: () => this.getBool(STORAGE_KEYS.PRO_TRIAL_EXPIRED_FIRED),
    markTrialExpiredFired: () => this.setBool(STORAGE_KEYS.PRO_TRIAL_EXPIRED_FIRED, true),
  };

  // ─── Shopping manual items ─────────────────────────────────────────────
  readonly manualList = {
    getItems: <T>() => this.getJson<T[]>(STORAGE_KEYS.SHOPPING_MANUAL_ITEMS) ?? [],
    setItems: <T>(items: T[]) => this.setJson(STORAGE_KEYS.SHOPPING_MANUAL_ITEMS, items),
    clear: () => this.remove(STORAGE_KEYS.SHOPPING_MANUAL_ITEMS),
  };

  // ─── RevenueCat anon identifier ────────────────────────────────────────
  readonly revenuecat = {
    getUserId: () => this.getString(STORAGE_KEYS.REVENUECAT_USER_ID),
    setUserId: (v: string) => this.setString(STORAGE_KEYS.REVENUECAT_USER_ID, v),
  };

  // ─── Sentry consent mirror ─────────────────────────────────────────────
  readonly errorReporting = {
    isEnabled: () => this.getBool(STORAGE_KEYS.ERROR_REPORTING_ENABLED),
    setEnabled: (v: boolean) => this.setBool(STORAGE_KEYS.ERROR_REPORTING_ENABLED, v),
  };

  // ─── Household size (scales food-coverage estimate) ───────────────────
  readonly householdSize = {
    get: () => this.getNumber(STORAGE_KEYS.HOUSEHOLD_SIZE) ?? 1,
    set: (n: number) => this.setNumber(STORAGE_KEYS.HOUSEHOLD_SIZE, n),
  };

  // ─── Coach marks (one-shot per-device flags) ───────────────────────────
  readonly coachMark = {
    isShown: (key: string) => this.getBool(`${STORAGE_KEYS.COACH_MARK_PREFIX}${key}`),
    markShown: (key: string) => this.setBool(`${STORAGE_KEYS.COACH_MARK_PREFIX}${key}`, true),
    reset: (key: string) => this.remove(`${STORAGE_KEYS.COACH_MARK_PREFIX}${key}`),
  };

  // ─── In-app review prompt cadence ──────────────────────────────────────
  readonly review = {
    isPending: () => this.getBool(STORAGE_KEYS.REVIEW_PENDING),
    setPending: (v: boolean) => this.setBool(STORAGE_KEYS.REVIEW_PENDING, v),
    clearPending: () => this.remove(STORAGE_KEYS.REVIEW_PENDING),

    getFirstUseAt: () => this.getDate(STORAGE_KEYS.REVIEW_FIRST_USE_AT),
    setFirstUseAt: (v: Date | string) => this.setDate(STORAGE_KEYS.REVIEW_FIRST_USE_AT, v),

    getLastPromptAt: () => this.getDate(STORAGE_KEYS.REVIEW_LAST_PROMPT_AT),
    setLastPromptAt: (v: Date | string) => this.setDate(STORAGE_KEYS.REVIEW_LAST_PROMPT_AT, v),

    getCompletedAt: () => this.getDate(STORAGE_KEYS.REVIEW_COMPLETED_AT),
    setCompletedAt: (v: Date | string) => this.setDate(STORAGE_KEYS.REVIEW_COMPLETED_AT, v),

    getLaunchCount: () => this.getNumber(STORAGE_KEYS.REVIEW_LAUNCH_COUNT) ?? 0,
    setLaunchCount: (v: number) => this.setNumber(STORAGE_KEYS.REVIEW_LAUNCH_COUNT, v),

    getProductAddCount: () => this.getNumber(STORAGE_KEYS.REVIEW_PRODUCT_ADD_COUNT) ?? 0,
    setProductAddCount: (v: number) => this.setNumber(STORAGE_KEYS.REVIEW_PRODUCT_ADD_COUNT, v),

    getConsumeCount: () => this.getNumber(STORAGE_KEYS.REVIEW_CONSUME_COUNT) ?? 0,
    setConsumeCount: (v: number) => this.setNumber(STORAGE_KEYS.REVIEW_CONSUME_COUNT, v),
  };

  // ─── Generic typed primitives (private — every public path goes through
  // a domain-scoped accessor above) ──────────────────────────────────────

  private getString(key: string): string | null {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  private setString(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
  }

  private remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* swallow */ }
  }

  private getBool(key: string, fallback = false): boolean {
    const raw = this.getString(key);
    if (raw === null) return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return Boolean(raw);
  }

  private setBool(key: string, value: boolean): void {
    this.setString(key, value ? 'true' : 'false');
  }

  private getNumber(key: string): number | null {
    const raw = this.getString(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private setNumber(key: string, value: number): void {
    this.setString(key, String(value));
  }

  private getDate(key: string): Date | null {
    const raw = this.getString(key);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private setDate(key: string, value: Date | string): void {
    const iso = value instanceof Date ? value.toISOString() : value;
    this.setString(key, iso);
  }

  private getJson<T>(key: string): T | null {
    const raw = this.getString(key);
    if (raw === null) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  }

  private setJson<T>(key: string, value: T): void {
    this.setString(key, JSON.stringify(value));
  }
}
