import { ES_DATE_FORMAT_OPTIONS } from '@core/models/shared';

export interface QuantityFormatOptions {
  decimals?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  fallback?: string;
}

export interface DateFormatOptions {
  fallback?: string;
}

export function roundQuantity(value: number | null | undefined, decimals = 2): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

export function formatQuantity(
  value: number | null | undefined,
  locale: string,
  options?: QuantityFormatOptions
): string {
  const decimals = options?.decimals ?? options?.maximumFractionDigits ?? 2;
  const rounded = roundQuantity(value, decimals);
  if (!Number.isFinite(rounded)) {
    return options?.fallback ?? '0';
  }
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? decimals,
  });
  return formatter.format(rounded);
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
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) {
    return fallback || (typeof value === 'string' ? value : '');
  }
  return date.toLocaleDateString(locale, options);
}

export function formatShortDate(
  value: string | Date | null | undefined,
  locale: string,
  options?: DateFormatOptions
): string {
  return formatDateValue(value, locale, ES_DATE_FORMAT_OPTIONS.numeric, options);
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
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) {
    return fallback || (typeof value === 'string' ? value : '');
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
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) {
    return fallback || (typeof value === 'string' ? value : '');
  }
  return date.toLocaleTimeString(locale, timeOptions);
}
