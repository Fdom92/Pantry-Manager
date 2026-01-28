import { MeasurementUnit } from '@core/models/shared';

export interface NormalizeStringListOptions {
  fallback?: readonly string[];
  ensure?: readonly string[];
  keyFn?: (value: string) => string;
}

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeLocationId(value?: string | null, fallback: string = ''): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

export function normalizeCategoryId(value: string | null | undefined): string {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed || trimmed.toLowerCase() === 'uncategorized') {
    return '';
  }
  return trimmed;
}

export function normalizeStringList(
  values: unknown,
  options: NormalizeStringListOptions = {},
): string[] {
  const { fallback = [], ensure = [], keyFn = normalizeKey } = options;
  const source = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  const addValue = (candidate?: string | null): void => {
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      return;
    }
    const key = keyFn(trimmed);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push(trimmed);
  };

  for (const entry of source) {
    addValue(entry);
  }

  for (const entry of ensure) {
    addValue(entry);
  }

  if (!normalized.length) {
    return [...fallback];
  }

  return normalized;
}

export function normalizeUnitValue(
  unit: MeasurementUnit | string | undefined,
  fallback: MeasurementUnit | string = MeasurementUnit.UNIT,
): string {
  if (typeof unit !== 'string') {
    return typeof fallback === 'string' ? fallback : MeasurementUnit.UNIT;
  }
  const trimmed = unit.trim();
  if (!trimmed) {
    return typeof fallback === 'string' ? fallback : MeasurementUnit.UNIT;
  }
  return trimmed;
}

export function normalizeSupermarketValue(value?: string | null): string | undefined {
  const normalized = normalizeWhitespace(value);
  return normalized || undefined;
}

export function formatFriendlyName(value: string, fallback: string): string {
  const key = value?.trim();
  if (!key) {
    return fallback;
  }
  const plain = key.replace(/^(category:|location:)/i, '');
  return plain
    .split(/[-_:]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeEntityName(value: string, fallback: string): string {
  return formatFriendlyName(value, fallback);
}

export function dedupeByNormalizedKey<T>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeKey(keyFn(item));
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
