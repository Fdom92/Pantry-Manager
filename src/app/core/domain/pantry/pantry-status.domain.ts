import { ExpirationStatus } from '@core/models';
import type { ExpiryClassification, ItemBatch, PantryItem, ProductStatusState } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { collectBatches, sumQuantities } from './pantry-batch.domain';
import { FRESH_NEAR_EXPIRY_WINDOW_DAYS, FRESH_QTY } from './fresh.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

export const REVIEW_GRACE_DAYS = 7;

export function getExpiryModeFromFoodType(
  foodType: FoodType | undefined
): 'strict' | 'flexible' | 'ignore' {
  switch (foodType) {
    case FoodType.DAIRY:
    case FoodType.CARB:
      return 'flexible';
    case FoodType.HOUSEHOLD:
      return 'ignore';
    default:
      return 'strict';
  }
}

function getDaysPastExpiry(
  batches: ItemBatch[] | undefined,
  now: Date
): number | null {
  const reference = new Date(now);
  reference.setHours(0, 0, 0, 0);
  const referenceTime = reference.getTime();

  let latestExpiredTime: number | null = null;

  for (const batch of collectBatches(batches)) {
    if (!batch.expirationDate) continue;
    const exp = new Date(batch.expirationDate);
    if (!Number.isFinite(exp.getTime())) continue;
    exp.setHours(0, 0, 0, 0);
    if (exp < reference) {
      if (latestExpiredTime === null || exp.getTime() > latestExpiredTime) {
        latestExpiredTime = exp.getTime();
      }
    }
  }

  if (latestExpiredTime === null) return null;
  return Math.round((referenceTime - latestExpiredTime) / (1000 * 60 * 60 * 24));
}

/**
 * Helper to extract stock context values with fallbacks
 */
function extractStockContext(
  item: PantryItem,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): { totalQuantity: number; minThreshold: number } {
  const totalQuantity =
    context && typeof context.totalQuantity === 'number'
      ? context.totalQuantity
      : sumQuantities(item.batches);

  const minThreshold =
    context && typeof context.minThreshold === 'number'
      ? context.minThreshold
      : toNumberOrZero(item.minThreshold);

  return { totalQuantity, minThreshold };
}

export function classifyExpiry(
  expirationDate: string | undefined | null,
  now: Date,
  windowDays: number
): ExpiryClassification {
  if (!expirationDate) {
    return 'unknown';
  }

  const exp = new Date(expirationDate);
  if (!Number.isFinite(exp.getTime())) {
    return 'unknown';
  }

  const reference = new Date(now);
  reference.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);

  if (exp < reference) {
    return 'expired';
  }

  const diff = exp.getTime() - reference.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days >= 0 && days <= windowDays) {
    return 'near-expiry';
  }

  return 'normal';
}

export function computeExpirationStatus(
  batches: ItemBatch[] | undefined,
  now: Date,
  windowDays: number
): ExpirationStatus {
  let status = ExpirationStatus.OK;
  for (const batch of collectBatches(batches)) {
    const classification = classifyExpiry(batch.expirationDate, now, windowDays);
    if (classification === 'expired') {
      return ExpirationStatus.EXPIRED;
    }
    if (classification === 'near-expiry') {
      status = ExpirationStatus.NEAR_EXPIRY;
    }
  }
  return status;
}

export function hasOpenBatch(item: PantryItem): boolean {
  return collectBatches(item.batches).some(batch => Boolean(batch.opened));
}

function isItemLowStock(
  item: PantryItem,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): boolean {
  const { totalQuantity, minThreshold } = extractStockContext(item, context);
  return minThreshold > 0 && totalQuantity < minThreshold;
}

export function getItemStatusState(
  item: PantryItem,
  now: Date,
  windowDays: number,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): ProductStatusState {
  // Fresh items have their own classification: tighter near-expiry window (3 days)
  // and discrete qty states. Must run BEFORE the general expiry check so the
  // 15-day pantry window doesn't catch 14-day fresh dates as near-expiry.
  if (item.productType === 'fresh') {
    const qty = sumQuantities(item.batches ?? []);
    // Depleted items are low-stock, not expired — prevents false positives when a
    // stale expiry date lingers on a zero-quantity fresh item.
    if (qty <= 0) return 'low-stock';
    const freshExpiry = computeExpirationStatus(item.batches, now, FRESH_NEAR_EXPIRY_WINDOW_DAYS);
    if (freshExpiry === ExpirationStatus.EXPIRED) return 'expired';
    if (freshExpiry === ExpirationStatus.NEAR_EXPIRY) return 'near-expiry';
    return qty < FRESH_QTY.sufficient ? 'low-stock' : 'normal';
  }

  const expirationStatus = computeExpirationStatus(item.batches, now, windowDays);
  if (expirationStatus === ExpirationStatus.EXPIRED) {
    const mode = getExpiryModeFromFoodType(item.foodType);
    if (mode === 'flexible') {
      const daysPast = getDaysPastExpiry(item.batches, now);
      if (daysPast !== null && daysPast <= REVIEW_GRACE_DAYS) {
        return 'review';
      }
    }
    if (mode === 'ignore') return 'normal';
    return 'expired';
  }
  if (expirationStatus === ExpirationStatus.NEAR_EXPIRY) return 'near-expiry';
  if (isItemLowStock(item, context)) return 'low-stock';
  return 'normal';
}

export function shouldAutoAddToShoppingList(
  item: PantryItem,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): boolean {
  if (!item?.isBasic) {
    return false;
  }

  const { totalQuantity, minThreshold } = extractStockContext(item, context);
  if (item.productType === 'fresh') {
    return totalQuantity < FRESH_QTY.sufficient;
  }
  return totalQuantity <= 0 || (minThreshold > 0 && totalQuantity < minThreshold);
}

// ─── Sort weight helpers (moved from utils/ — domain logic, not utilities) ───

/**
 * Maps a ProductStatusState to a numeric sort weight.
 * Lower weight = higher priority (appears earlier in sorted lists).
 */
export function getStatusSortWeight(state: ProductStatusState): number {
  switch (state) {
    case 'expired':    return 0;
    case 'near-expiry': return 1;
    case 'low-stock':  return 2;
    default:           return 3;
  }
}

/**
 * Compute expiration-based sort weight for a pantry item.
 * Convenience wrapper around getItemStatusState + getStatusSortWeight.
 */
export function getExpirationSortWeight(item: PantryItem, now: Date = new Date()): number {
  return getStatusSortWeight(getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS));
}
