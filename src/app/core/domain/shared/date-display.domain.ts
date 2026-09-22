import { parseExpiryDate } from '@core/utils/date.util';

/**
 * How a number of days is shown to the user. The single rule behind every
 * "in N …" / "N … left" in the app, so the dashboard and the despensa never
 * disagree ("270 días" vs "9 meses").
 *
 * Short spans stay in days because that's where urgency lives; beyond that
 * the exact day count is noise.
 */
export type DurationUnit = 'day' | 'week' | 'month' | 'year';

export interface DisplayDuration {
  readonly value: number;
  readonly unit: DurationUnit;
}

const DAYS_PER_MONTH = 30.44;

/** Magnitude only: the caller decides whether it's past or future. */
export function toDisplayDuration(days: number): DisplayDuration {
  const abs = Number.isFinite(days) ? Math.abs(Math.round(days)) : 0;
  if (abs < 14) return { value: abs, unit: 'day' };
  if (abs < 60) return { value: Math.round(abs / 7), unit: 'week' };
  const months = Math.round(abs / DAYS_PER_MONTH);
  if (months < 12) return { value: months, unit: 'month' };
  return { value: Math.max(1, Math.round(abs / 365)), unit: 'year' };
}

/** "9 meses", "1 día", "3 weeks" — a length of time with no direction. */
export function formatDuration(days: number, locale: string): string {
  const { value, unit } = toDisplayDuration(days);
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
}

/**
 * "hoy", "mañana", "dentro de 9 meses", "hace 3 días" — signed: positive is
 * the future. Intl owns the grammar (German needs the dative: "in 9 Monaten"),
 * so the i18n bundles only carry the frame around it ("Caduca {{when}}").
 */
export function formatRelativeDays(days: number, locale: string): string {
  if (!Number.isFinite(days)) return '';
  const { value, unit } = toDisplayDuration(days);
  const signed = days < 0 ? -value : value;
  // Words only for today/tomorrow/yesterday: 'auto' would also say "pasado
  // mañana" or "el próximo año", which reads as a calendar date, not a span.
  const numeric = unit === 'day' && value <= 1 ? 'auto' : 'always';
  return new Intl.RelativeTimeFormat(locale, { numeric }).format(signed, unit);
}

export type DisplayDateStyle = 'dayMonth' | 'dayMonthLong' | 'short' | 'long' | 'dateTime';

const DATE_STYLES: Record<DisplayDateStyle, Intl.DateTimeFormatOptions> = {
  dayMonth: { day: 'numeric', month: 'short' },
  dayMonthLong: { day: 'numeric', month: 'long' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/** A calendar date ("5 jul", "5 de julio de 2026"); '' on invalid input. */
export function formatDisplayDate(
  value: string | Date | null | undefined,
  locale: string,
  style: DisplayDateStyle = 'short'
): string {
  const date = value instanceof Date ? value : parseExpiryDate(value);
  if (date === null || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, DATE_STYLES[style]).format(date);
}
