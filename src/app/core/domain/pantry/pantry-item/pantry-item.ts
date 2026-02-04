import { classifyExpiry, computeEarliestExpiry, sumQuantities, toNumberOrZero } from '@core/domain/pantry/pantry-stock';
import { ItemBatch, PantryItem, ProductStatusState } from '@core/models/pantry';
import { ExpirationStatus } from '@core/models/shared';
import { normalizeUnitValue } from '@core/utils/normalization.util';
import type { BatchIdGenerator } from '../pantry.domain';

export function collectBatches(
  batches: ItemBatch[],
  options?: { generateBatchId?: BatchIdGenerator; fallbackUnit?: string }
): ItemBatch[] {
  const normalized: ItemBatch[] = [];
  const fallbackUnit = normalizeUnitValue(options?.fallbackUnit);
  for (const batch of batches ?? []) {
    if (!batch) {
      continue;
    }
    normalized.push({
      ...batch,
      quantity: toNumberOrZero(batch.quantity),
      unit: normalizeUnitValue(batch.unit ?? fallbackUnit),
      batchId: batch.batchId ?? options?.generateBatchId?.(),
      opened: batch.opened ?? false,
      locationId: (batch.locationId ?? '').trim() || undefined,
    });
  }
  return normalized;
}

export function getItemTotalQuantity(item: PantryItem): number {
  return sumQuantities(item.batches ?? []);
}

export function getItemTotalMinThreshold(item: PantryItem): number {
  return toNumberOrZero(item.minThreshold);
}

export function getItemEarliestExpiry(item: PantryItem): string | undefined {
  return computeEarliestExpiry(item.batches ?? []);
}

export function hasOpenBatch(item: PantryItem): boolean {
  return collectBatches(item.batches ?? []).some(batch => Boolean(batch.opened));
}

export function computeExpirationStatus(
  batches: ItemBatch[],
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

export function isItemExpired(item: PantryItem, now: Date): boolean {
  return collectBatches(item.batches ?? []).some(batch => classifyExpiry(batch.expirationDate, now, 0) === 'expired');
}

export function isItemNearExpiry(item: PantryItem, now: Date, windowDays: number): boolean {
  return collectBatches(item.batches ?? []).some(batch => classifyExpiry(batch.expirationDate, now, windowDays) === 'near-expiry');
}

export function isItemLowStock(item: PantryItem, context?: { totalQuantity?: number; minThreshold?: number | null }): boolean {
  const totalQuantity =
    context && typeof context.totalQuantity === 'number' ? context.totalQuantity : getItemTotalQuantity(item);
  const minThreshold =
    context && typeof context.minThreshold === 'number'
      ? context.minThreshold
      : getItemTotalMinThreshold(item);

  return minThreshold > 0 && totalQuantity < minThreshold;
}

export function getItemStatusState(
  item: PantryItem,
  now: Date,
  windowDays: number,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): ProductStatusState {
  if (isItemExpired(item, now)) {
    return 'expired';
  }
  if (isItemNearExpiry(item, now, windowDays)) {
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
  if (!item || !item.isBasic) {
    return false;
  }

  const totalQuantity =
    context && typeof context.totalQuantity === 'number' ? context.totalQuantity : getItemTotalQuantity(item);

  const hasMinThresholdOverride = Boolean(context && 'minThreshold' in context);
  const minThreshold = hasMinThresholdOverride
    ? context?.minThreshold ?? null
    : item.minThreshold != null
      ? Number(item.minThreshold)
      : null;

  if (totalQuantity <= 0) {
    return true;
  }

  if (minThreshold != null && totalQuantity < minThreshold) {
    return true;
  }

  return false;
}
