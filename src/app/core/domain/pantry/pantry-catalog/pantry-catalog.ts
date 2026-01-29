import { AppPreferences } from '@core/models';
import { PantryItem } from '@core/models/pantry';
import {
  formatFriendlyName,
  normalizeKey,
  normalizeStringList,
  normalizeSupermarketValue,
} from '@core/utils/normalization.util';

export function getPresetCategoryOptions(preferences: Pick<AppPreferences, 'categoryOptions'>): string[] {
  return normalizeStringList(preferences.categoryOptions, { fallback: [] });
}

export function getPresetLocationOptions(preferences: Pick<AppPreferences, 'locationOptions'>): string[] {
  return normalizeStringList(preferences.locationOptions, { fallback: [] });
}

export function getPresetSupermarketOptions(preferences: Pick<AppPreferences, 'supermarketOptions'>): string[] {
  return normalizeStringList(preferences.supermarketOptions, { fallback: [] });
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
