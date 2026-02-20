export interface NormalizeStringListOptions {
  fallback?: readonly string[];
  keyFn?: (value: string) => string;
}

/**
 * Core normalization functions hierarchy:
 * - normalizeTrim: Basic trim
 * - normalizeWhitespace: Collapse multiple spaces + trim
 * - normalizeLowercase: Trim + lowercase
 * - normalizeWhitespaceLowercase: Collapse spaces + trim + lowercase
 */

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeTrim(value?: string | null): string {
  return (value ?? '').trim();
}

export function normalizeLowercase(value?: string | null): string {
  return normalizeTrim(value).toLowerCase();
}

export function normalizeOptionalTrim(value?: string | null): string | undefined {
  const trimmed = normalizeTrim(value);
  return trimmed || undefined;
}

export function normalizeWhitespaceLowercase(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeSearchQuery(value: string | null | undefined): string {
  return normalizeWhitespaceLowercase(value);
}

export function normalizeSearchField(value: unknown): string {
  return normalizeWhitespaceLowercase(String(value ?? ''));
}

export function normalizeLocaleCode(locale?: string | null): string | null {
  if (!locale) {
    return null;
  }
  const normalized = normalizeLowercase(locale).replace('_', '-');
  const [base] = normalized.split('-');
  return base || null;
}

export function normalizeSupermarketName(value?: string | null): string | undefined {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  return lower.replace(/\b\w/g, char => char.toUpperCase());
}

export function normalizeLocationId(value?: string | null, fallback: string = ''): string {
  return normalizeTrim(value) || fallback;
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
  const { fallback = [], keyFn = normalizeLowercase } = options;
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

  if (!normalized.length) {
    return [...fallback];
  }

  return normalized;
}

export function normalizeSupermarketValue(value?: string | null): string | undefined {
  const normalized = normalizeWhitespace(value);
  return normalized || undefined;
}

export function formatFriendlyName(value: string, fallback: string): string {
  const key = normalizeTrim(value);
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

export function dedupeByNormalizedKey<T>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeLowercase(keyFn(item));
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
