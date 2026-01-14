import { DEFAULT_CATEGORY_OPTIONS, DEFAULT_LOCATION_OPTIONS, DEFAULT_SUPERMARKET_OPTIONS } from '@core/constants';
import { PantryItem } from '@core/models/inventory';
import { AppPreferences } from '@core/models/user';
import { normalizeKey, normalizeStringList, normalizeSupermarketValue } from '@core/utils/normalization.util';

export function getPresetCategoryOptions(preferences: Pick<AppPreferences, 'categoryOptions'>): string[] {
  return normalizeStringList(preferences.categoryOptions, { fallback: DEFAULT_CATEGORY_OPTIONS });
}

export function getPresetLocationOptions(preferences: Pick<AppPreferences, 'locationOptions'>): string[] {
  return normalizeStringList(preferences.locationOptions, { fallback: DEFAULT_LOCATION_OPTIONS });
}

export function getPresetSupermarketOptions(preferences: Pick<AppPreferences, 'supermarketOptions'>): string[] {
  return normalizeStringList(preferences.supermarketOptions, { fallback: DEFAULT_SUPERMARKET_OPTIONS });
}

export function computeSupermarketSuggestions(items: PantryItem[]): string[] {
  const options = new Map<string, string>();
  for (const item of items) {
    const normalizedValue = normalizeSupermarketValue(item.supermarket);
    if (!normalizedValue) {
      continue;
    }
    const key = normalizedValue.toLowerCase();
    if (!options.has(key)) {
      options.set(key, normalizedValue);
    }
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
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

export function formatCategoryName(value: string, uncategorizedLabel: string): string {
  return formatFriendlyName(value, uncategorizedLabel);
}

export function formatSupermarketLabel(value: string, otherLabel?: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
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
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeKey(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({ value: trimmed, label: config?.labelFor ? config.labelFor(trimmed) : trimmed });
  }

  return options;
}
