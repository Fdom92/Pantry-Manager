import { classifyExpiry, computeEarliestExpiry, toNumberOrZero } from '@core/domain/pantry-stock';
import { ItemBatch, ItemLocationStock, PantryItem } from '@core/models/inventory';
import { ExpirationStatus } from '@core/models/shared';
import { normalizeUnitValue } from '@core/utils/normalization.util';

export type BatchIdGenerator = () => string;

export function collectBatches(
  locations: ItemLocationStock[],
  options?: { generateBatchId?: BatchIdGenerator; fallbackUnit?: string }
): ItemBatch[] {
  const batches: ItemBatch[] = [];
  const fallbackUnit = normalizeUnitValue(options?.fallbackUnit);
  for (const location of locations) {
    if (!Array.isArray(location.batches)) {
      continue;
    }
    const locationUnit = normalizeUnitValue(location.unit ?? fallbackUnit);
    for (const batch of location.batches) {
      batches.push({
        ...batch,
        quantity: toNumberOrZero(batch.quantity),
        unit: normalizeUnitValue(batch.unit ?? locationUnit),
        batchId: batch.batchId ?? options?.generateBatchId?.(),
        opened: batch.opened ?? false,
      });
    }
  }
  return batches;
}

export function getLocationQuantity(location: ItemLocationStock): number {
  if (!Array.isArray(location.batches) || location.batches.length === 0) {
    return 0;
  }
  return location.batches.reduce((sum, batch) => sum + toNumberOrZero(batch.quantity), 0);
}

export function getItemTotalQuantity(item: PantryItem): number {
  return (item.locations ?? []).reduce((sum, loc) => sum + getLocationQuantity(loc), 0);
}

export function getItemTotalMinThreshold(item: PantryItem): number {
  return toNumberOrZero(item.minThreshold);
}

export function getItemQuantityByLocation(item: PantryItem, locationId: string): number {
  const target = (locationId ?? '').trim();
  if (!target) {
    return 0;
  }
  return (item.locations ?? [])
    .filter(loc => (loc.locationId ?? '').trim() === target)
    .reduce((sum, loc) => sum + getLocationQuantity(loc), 0);
}

export function getItemEarliestExpiry(item: PantryItem): string | undefined {
  return computeEarliestExpiry(item.locations ?? []);
}

export function hasOpenBatch(item: PantryItem): boolean {
  return collectBatches(item.locations ?? []).some(batch => Boolean(batch.opened));
}

export function computeExpirationStatus(
  locations: ItemLocationStock[],
  now: Date,
  windowDays: number
): ExpirationStatus {
  let status = ExpirationStatus.OK;
  for (const batch of collectBatches(locations)) {
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
  return collectBatches(item.locations ?? []).some(batch => classifyExpiry(batch.expirationDate, now, 0) === 'expired');
}

export function isItemNearExpiry(item: PantryItem, now: Date, windowDays: number): boolean {
  return collectBatches(item.locations ?? []).some(batch => classifyExpiry(batch.expirationDate, now, windowDays) === 'near-expiry');
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

