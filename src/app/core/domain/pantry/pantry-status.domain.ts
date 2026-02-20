import { ExpirationStatus } from '@core/models';
import type { ExpiryClassification, ItemBatch, PantryItem, ProductStatusState } from '@core/models/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { collectBatches, sumQuantities } from './pantry-batch.domain';

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

export function isItemLowStock(
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
  const expirationStatus = computeExpirationStatus(item.batches, now, windowDays);
  if (expirationStatus === ExpirationStatus.EXPIRED) {
    return 'expired';
  }
  if (expirationStatus === ExpirationStatus.NEAR_EXPIRY) {
    return 'near-expiry';
  }
  if (isItemLowStock(item, context)) {
    return 'low-stock';
  }
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
  return totalQuantity <= 0 || (minThreshold > 0 && totalQuantity < minThreshold);
}
