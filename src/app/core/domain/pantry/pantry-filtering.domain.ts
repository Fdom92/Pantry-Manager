import { NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS } from '@core/constants';
import type { PantryStatusFilterValue, PantrySummaryMeta } from '@core/models/pantry';
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
 * Count how many of the item's batches are missing an expiration date and
 * aren't explicitly marked noExpiry. Fresh items never count (no batch-level dates).
 */
export function countMissingExpiryBatches(item: PantryItem): number {
  if (item.productType === 'fresh') return 0;
  const batches = item.batches ?? [];
  return batches.filter(b => !b.expirationDate && !b.noExpiry).length;
}

/**
 * Check if any of the item's batches is missing an expiration date and isn't
 * explicitly marked noExpiry. Fresh items never count (no batch-level dates).
 */
export function hasMissingExpiry(item: PantryItem): boolean {
  return countMissingExpiryBatches(item) > 0;
}

/**
 * Check if item is missing relevant tracking data (no foodType or any batch without expiry).
 */
export function isIncomplete(item: PantryItem): boolean {
  if (!item.foodType) return true;
  return hasMissingExpiry(item);
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

/**
 * How many products a status filter would show. The single mapping between a
 * filter value and its summary count, so the chip row and the "fall back to
 * All" rule can never read different numbers.
 */
export function statusFilterCount(
  summary: Pick<PantrySummaryMeta, 'total' | 'statusCounts'>,
  value: PantryStatusFilterValue,
): number {
  const counts = summary.statusCounts;
  switch (value) {
    case 'all': return summary.total;
    case 'normal': return counts.normal;
    case 'low-stock': return counts.lowStock;
    case 'near-expiry': return counts.expiring;
    case 'review': return counts.review;
    case 'expired': return counts.expired;
    case 'pendientes': return counts.pendientes;
  }
}

/**
 * A chip earns its place only when tapping it would show something. "All" is
 * the exception — it is the way back. A row of "Caducados 0 · Revisar 0" is
 * noise, and a chip that appears only when there is something expired doubles
 * as the alert. Pendientes already worked this way; now every chip does.
 */
export function isStatusChipVisible(value: PantryStatusFilterValue, count: number): boolean {
  return value === 'all' || count > 0;
}
