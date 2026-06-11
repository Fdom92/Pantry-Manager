/**
 * Centralised date parsing + formatting helpers.
 *
 * Why this module exists:
 * - `new Date(stringValue)` and `Date.parse(stringValue)` silently produce
 *   Invalid Date / NaN when the input string is in an unexpected shape.
 *   Downstream `.getTime()` and `Intl.DateTimeFormat.format(...)` then either
 *   propagate NaN through arithmetic or throw `RangeError: Invalid time
 *   value`. Both failure modes have already shipped in PantryMind v4.6.
 * - The app stores expiration dates as `YYYY-MM-DD` (the canonical shape
 *   emitted by `<input type="date">` and by the quick-date-chips component).
 *   Some legacy / migrated docs may carry full ISO strings like
 *   `2026-07-11T00:00:00Z`. Both are valid; the parsers below accept either
 *   and normalise them.
 * - Plain `YYYY-MM-DD` must be interpreted in the user's *local* timezone so
 *   "5 jul" stays "5 jul" rather than rolling back a day at midnight in
 *   negative-UTC zones. Full ISO strings already carry their own offset.
 *
 * Use these helpers everywhere a date arrives as a string. Never call
 * `new Date(str)` or `Date.parse(str)` directly on user/PouchDB data.
 */

const PLAIN_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a stored date string into a Date, returning null on invalid input.
 *
 * - `YYYY-MM-DD` → local Date at midnight (no timezone shift).
 * - Anything else → delegated to `new Date(value)`, which handles full ISO,
 *   RFC 2822 and other formats. NaN-time results are normalised to null.
 */
export function parseExpiryDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = PLAIN_YMD_RE.exec(value);
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Same as `parseExpiryDate` but returns the epoch milliseconds, or null.
 * Convenient for `(a - b)` arithmetic without intermediate Date allocation.
 */
export function parseExpiryMs(value: string | null | undefined): number | null {
  const d = parseExpiryDate(value);
  return d === null ? null : d.getTime();
}

/**
 * Days from "now" until the given date string. Returns NaN on invalid input
 * — kept as `number` rather than `number | null` so existing callers that
 * compare with `< 0` etc. continue to type-check. NaN comparisons are always
 * false, so an invalid date simply falls out of any urgency bucket.
 *
 * Positive: future expiry. Zero: today. Negative: already expired.
 * Uses Math.ceil so that "today at 23:59" still counts as 0.
 */
export function daysUntilExpiry(dateStr: string | null | undefined, nowMs = Date.now()): number {
  const ms = parseExpiryMs(dateStr);
  if (ms === null) return Number.NaN;
  return Math.ceil((ms - nowMs) / 86_400_000);
}

/**
 * Pretty-print a stored date for display ("11 jul" / "5 jul 2026" etc.).
 * Returns '' on invalid input so the caller can safely interpolate.
 */
export function formatExpiryLabel(
  value: string | null | undefined,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const d = parseExpiryDate(value);
  if (d === null) return '';
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

/**
 * Build a `YYYY-MM-DD` string from a Date in **local** time.
 * Avoids `.toISOString()` which is UTC and can roll the day backwards at
 * midnight edges in negative-UTC zones.
 */
export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Existing helpers, kept as-is ─────────────────────────────────────────────

export function isWithinHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  return hour >= startHour && hour < endHour;
}

export function isSundayAfternoon(date: Date): boolean {
  return date.getDay() === 0 && date.getHours() >= 15;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 5 || day === 6; // Friday, Saturday, Sunday
}

/**
 * Convert any stored date string into the `YYYY-MM-DD` shape consumable by an
 * `<input type="date">`. Returns '' on invalid input.
 */
export function toDateInputValue(dateIso: string | null | undefined): string {
  const d = parseExpiryDate(dateIso);
  return d === null ? '' : toLocalYmd(d);
}

/**
 * Normalise a user-typed date string into the canonical `YYYY-MM-DD` storage
 * shape (ISO 8601 date). Local-date semantics: never `.toISOString()`, which
 * is UTC-based and rolls the calendar day at midnight edges (e.g. a typed
 * "2026-05-28" became "2026-05-27T22:00:00Z" in UTC+2).
 * Returns null on invalid input.
 */
export function toIsoDate(dateInput: string | null | undefined): string | null {
  const trimmed = dateInput?.trim?.() ?? '';
  if (!trimmed) return null;
  const d = parseExpiryDate(trimmed);
  return d === null ? null : toLocalYmd(d);
}
