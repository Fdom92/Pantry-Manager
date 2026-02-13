import { NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS } from '@core/constants';
import { getExpirationSortWeight } from '@core/utils/pantry-status.util';
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
 */
export function matchesFilters(item: PantryItem, filters: PantryFilterState): boolean {
  if (filters.basic && !item.isBasic) return false;

  const state = getItemStatusState(item, new Date(), NEAR_EXPIRY_WINDOW_DAYS);

  if (filters.expired && state !== 'expired') return false;
  if (filters.expiring && state !== 'near-expiry') return false;
  if (filters.lowStock && state !== 'low-stock') return false;
  if (filters.recentlyAdded && !isRecentlyAdded(item)) return false;
  if (filters.normalOnly && state !== 'normal') return false;

  return true;
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
 * Sort pantry items by expiration status, then alphabetically.
 */
export function sortPantryItems(items: PantryItem[]): PantryItem[] {
  if (items.length <= 1) return items;

  const sorted = [...items];
  sorted.sort((a, b) => {
    const expirationDiff = getExpirationSortWeight(a) - getExpirationSortWeight(b);
    if (expirationDiff !== 0) return expirationDiff;

    const labelA = normalizeSearchField(a.name);
    const labelB = normalizeSearchField(b.name);
    return labelA.localeCompare(labelB);
  });
  return sorted;
}
