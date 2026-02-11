import type { PantryItem } from '@core/models/pantry';
import { normalizeLowercase, normalizeSupermarketValue, normalizeTrim } from './normalization.util';

export function computeSupermarketSuggestions(items: PantryItem[]): string[] {
  const options = new Map<string, string>();
  for (const item of items) {
    const normalizedValue = normalizeSupermarketValue(item.supermarket);
    if (!normalizedValue) {
      continue;
    }
    const key = normalizeLowercase(normalizedValue);
    if (!options.has(key)) {
      options.set(key, normalizedValue);
    }
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
}

export function formatSupermarketLabel(value: string, otherLabel?: string): string {
  const trimmed = normalizeTrim(value);
  const normalized = normalizeLowercase(trimmed);
  if (normalized === 'otro') {
    return otherLabel ?? trimmed;
  }
  return trimmed;
}

export function buildUniqueSelectOptions(
  values: Array<string | null | undefined>,
  config?: { labelFor?: (value: string) => string }
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];

  for (const value of values) {
    const trimmed = normalizeTrim(value);
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeLowercase(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({ value: trimmed, label: config?.labelFor ? config.labelFor(trimmed) : trimmed });
  }

  return options;
}
