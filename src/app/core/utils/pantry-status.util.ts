import { getItemStatusState } from '@core/domain/pantry';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import type { PantryItem, ProductStatusState } from '@core/models/pantry';

/**
 * Compute sort weight for expiration-based prioritization.
 * Lower weight = higher priority (earlier in list).
 */
export function getExpirationSortWeight(item: PantryItem, now: Date = new Date()): number {
  const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
  return getStatusSortWeight(state);
}

/**
 * Map status state to numeric sort weight.
 */
export function getStatusSortWeight(state: ProductStatusState): number {
  switch (state) {
    case 'expired':
      return 0;
    case 'near-expiry':
      return 1;
    case 'low-stock':
      return 2;
    default:
      return 3;
  }
}
