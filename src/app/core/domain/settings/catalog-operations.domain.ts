import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { normalizeLowercase } from '@core/utils/normalization.util';

/**
 * Check if a value exists in a list of options (case-insensitive).
 */
export function isDuplicateCatalogValue(
  value: string,
  existingValues: string[],
  normalize: (val: string) => string
): boolean {
  const normalized = normalizeLowercase(normalize(value));
  if (!normalized) return false;

  return existingValues.some(existing =>
    normalizeLowercase(normalize(existing)) === normalized
  );
}

/**
 * Filter items that match a catalog value.
 */
export function getItemsUsingCatalogValue<T = PantryItem>(
  items: T[],
  value: string,
  matcher: (item: T, normalizedValue: string) => boolean,
  normalize: (val: string) => string
): T[] {
  const normalizedValue = normalize(value);
  const normalizedKey = normalizeLowercase(normalizedValue);
  if (!normalizedKey) return [];

  return items.filter(item => matcher(item, normalizedValue));
}

/**
 * Get usage count and matching items for a catalog value.
 */
export function getCatalogUsage<T = PantryItem>(
  items: T[],
  value: string,
  matcher: (item: T, normalizedValue: string) => boolean,
  normalize: (val: string) => string
): { count: number; items: T[] } {
  const matchingItems = getItemsUsingCatalogValue(items, value, matcher, normalize);
  return {
    count: matchingItems.length,
    items: matchingItems,
  };
}

/**
 * Clear a catalog value from items by applying a transformation.
 */
export async function clearCatalogFromItems<T = PantryItem>(
  items: T[],
  transform: (item: T) => T,
  updateFn: (updatedItems: T[]) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  const updated = items.map(transform);
  await updateFn(updated);
}

/**
 * Normalize a list of catalog options (trim and filter empty).
 */
export function normalizeCatalogOptions(values: string[]): string[] {
  return values
    .map(val => val?.trim?.() ?? '')
    .filter(val => val.length > 0);
}
