import { ES_DATE_FORMAT_OPTIONS } from '@core/models/shared';

export interface DateFormatOptions {
  fallback?: string;
}

export function roundQuantity(value: number | null | undefined): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round(num);
}

export function formatQuantity(
  value: number | null | undefined,
  locale: string
): string {
  const rounded = roundQuantity(value);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(rounded);
}

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isFinite(date.getTime()) ? date : null;
}

function fallbackDateString(value: string | Date | null | undefined, fallback: string): string {
  return fallback || (typeof value === 'string' ? value : '');
}

export function formatDateValue(
  value: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = ES_DATE_FORMAT_OPTIONS.numeric,
  { fallback = '' }: DateFormatOptions = {}
): string {
  if (!value) {
    return fallback;
  }
  const date = toDateOrNull(value);
  return date ? date.toLocaleDateString(locale, options) : fallbackDateString(value, fallback);
}

export function formatDateTimeValue(
  value: string | Date | null | undefined,
  locale: string,
  {
    fallback = '',
    dateOptions = ES_DATE_FORMAT_OPTIONS.numeric,
    timeOptions = { hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
  }: DateFormatOptions & {
    dateOptions?: Intl.DateTimeFormatOptions;
    timeOptions?: Intl.DateTimeFormatOptions;
  } = {}
): string {
  if (!value) {
    return fallback;
  }
  const date = toDateOrNull(value);
  if (!date) {
    return fallbackDateString(value, fallback);
  }
  const datePart = date.toLocaleDateString(locale, dateOptions);
  const timePart = date.toLocaleTimeString(locale, timeOptions);
  return `${datePart} ${timePart}`.trim();
}

export function formatTimeValue(
  value: string | Date | null | undefined,
  locale: string,
  {
    fallback = '',
    timeOptions = { hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
  }: DateFormatOptions & {
    timeOptions?: Intl.DateTimeFormatOptions;
  } = {}
): string {
  if (!value) {
    return fallback;
  }
  const date = toDateOrNull(value);
  return date ? date.toLocaleTimeString(locale, timeOptions) : fallbackDateString(value, fallback);
}
