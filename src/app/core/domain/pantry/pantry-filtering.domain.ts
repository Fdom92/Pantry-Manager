import { NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS } from '@core/constants';
import { normalizeSearchField } from '@core/utils/normalization.util';
import type { PantryFilterState, PantryItem } from '@core/models/pantry';
import { getItemStatusState } from './pantry-status.domain';

/**
 * Check if item matches search query.
 */
export function matchesSearchQuery(item: PantryItem, query: string): boolean {
  if (!query) return true;
  const name = normalizeSearchField(item.name);
  return name.includes(query);
}

/**
 * Check if item matches active filters.
 * @param now - Reference timestamp. Defaults to Date.now() but should be passed
 *   explicitly in hot render paths to guarantee all items are evaluated against
 *   the same instant (multiple new Date() calls in a loop can differ by ms).
 */
export function matchesFilters(item: PantryItem, filters: PantryFilterState, now = new Date()): boolean {
  const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

  if (filters.expired && state !== 'expired') return false;
  if (filters.expiring && state !== 'near-expiry') return false;
  if (filters.review && state !== 'review') return false;
  if (filters.lowStock && state !== 'low-stock') return false;
  if (filters.recentlyAdded && !isRecentlyAdded(item)) return false;
  if (filters.normalOnly && state !== 'normal') return false;
  if (filters.pendientes && !isIncomplete(item)) return false;

  return true;
}

/**
 * Check if item is missing relevant tracking data (no foodType or any batch without expiry).
 * An item with multiple batches is incomplete if any batch lacks a date and isn't
 * explicitly marked noExpiry — not just when all batches are missing.
 */
export function isIncomplete(item: PantryItem): boolean {
  if (!item.foodType) return true;
  if (item.productType === 'fresh') return false;
  const batches = item.batches ?? [];
  return batches.some(b => !b.expirationDate && !b.noExpiry);
}

/**
 * Check if item was recently added based on configured window.
 */
export function isRecentlyAdded(item: PantryItem): boolean {
  const createdAt = new Date(item?.createdAt ?? '');
  if (Number.isNaN(createdAt.getTime())) return false;
  const windowMs = RECENTLY_ADDED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() <= windowMs;
}

/**
 * Sort pantry items alphabetically by name.
 */
export function sortPantryItems(items: PantryItem[]): PantryItem[] {
  if (items.length <= 1) return items;

  const sorted = [...items];
  sorted.sort((a, b) => {
    const labelA = normalizeSearchField(a.name);
    const labelB = normalizeSearchField(b.name);
    return labelA.localeCompare(labelB);
  });
  return sorted;
}
