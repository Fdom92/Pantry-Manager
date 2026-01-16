import { ItemBatch, ItemLocationStock } from '@core/models/pantry';
import { MeasurementUnit } from '@core/models/shared';
import { normalizeUnitValue } from '@core/utils/normalization.util';
import type { BatchIdGenerator } from '../pantry.domain';

export type ExpiryClassification = 'expired' | 'near-expiry' | 'normal' | 'unknown';

export function toNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function sumQuantities(
  batches: ItemBatch[] | undefined,
  options?: { round?: (value: number) => number }
): number {
  if (!Array.isArray(batches) || batches.length === 0) {
    return 0;
  }
  const total = batches.reduce((sum, batch) => sum + toNumberOrZero(batch.quantity), 0);
  return options?.round ? options.round(total) : total;
}

/**
 * Merge batches that share the same expiration date so duplicate entries collapse automatically.
 * Returns a new array without mutating the input batches.
 */
export function mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length <= 1) {
    return Array.isArray(batches) ? batches.map(batch => ({ ...batch })) : [];
  }

  const seen = new Map<string, ItemBatch>();
  const merged: ItemBatch[] = [];

  for (const batch of batches) {
    const key = (batch.expirationDate ?? '').trim();
    if (!key) {
      merged.push({ ...batch });
      continue;
    }

    const existing = seen.get(key);
    if (!existing) {
      const clone = { ...batch };
      seen.set(key, clone);
      merged.push(clone);
      continue;
    }

    existing.quantity = toNumberOrZero(existing.quantity) + toNumberOrZero(batch.quantity);
    existing.opened = Boolean(existing.opened || batch.opened);
  }

  return merged;
}

export function normalizeBatches(
  batches: ItemBatch[] | undefined,
  fallbackUnit: MeasurementUnit | string,
  options?: { generateBatchId?: BatchIdGenerator }
): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length === 0) {
    return [];
  }

  const normalizedUnit = normalizeUnitValue(fallbackUnit);
  const normalized = batches.map(batch => ({
    ...batch,
    batchId: batch.batchId ?? options?.generateBatchId?.(),
    quantity: toNumberOrZero(batch.quantity),
    unit: normalizeUnitValue(batch.unit ?? normalizedUnit),
    opened: batch.opened ?? false,
  }));

  return mergeBatchesByExpiry(normalized);
}

export function computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
  const dates: string[] = [];
  for (const location of locations) {
    const batches = Array.isArray(location.batches) ? location.batches : [];
    for (const batch of batches) {
      if (batch.expirationDate) {
        dates.push(batch.expirationDate);
      }
    }
  }

  if (dates.length === 0) {
    return undefined;
  }

  return dates.reduce((earliest, current) => {
    if (!earliest) {
      return current;
    }
    return new Date(current) < new Date(earliest) ? current : earliest;
  });
}

export function getLocationEarliestExpiry(location: ItemLocationStock): string | undefined {
  return computeEarliestExpiry([location]);
}

export function classifyExpiry(expirationDate: string | undefined | null, now: Date, windowDays: number): ExpiryClassification {
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

function getBatchTime(batch: ItemBatch): number | null {
  if (!batch.expirationDate) {
    return null;
  }
  const time = new Date(batch.expirationDate).getTime();
  return Number.isFinite(time) ? time : null;
}

export function moveBatches(params: {
  source: ItemBatch[];
  destination: ItemBatch[];
  amount: number;
  round?: (value: number) => number;
}): {
  moved: ItemBatch[];
  remainingSource: ItemBatch[];
  nextDestination: ItemBatch[];
} {
  const round = params.round ?? (value => value);
  let remaining = round(Math.max(0, params.amount));

  const ordered = [...params.source].sort((a, b) => {
    const aTime = getBatchTime(a) ?? Number.MAX_SAFE_INTEGER;
    const bTime = getBatchTime(b) ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const moved: ItemBatch[] = [];
  const leftover: ItemBatch[] = [];

  for (const batch of ordered) {
    const quantity = round(toNumberOrZero(batch.quantity));
    if (quantity <= 0) {
      continue;
    }

    if (remaining <= 0) {
      leftover.push({ ...batch, quantity });
      continue;
    }

    if (quantity <= remaining) {
      moved.push({ ...batch, quantity });
      remaining = round(remaining - quantity);
      continue;
    }

    moved.push({ ...batch, quantity: remaining });
    const remainder = round(quantity - remaining);
    leftover.push({ ...batch, quantity: remainder });
    remaining = 0;
  }

  if (remaining > 0) {
    // Not enough stock: keep the original inputs unchanged.
    return {
      moved: [],
      remainingSource: [...params.source].map(batch => ({ ...batch })),
      nextDestination: [...params.destination].map(batch => ({ ...batch })),
    };
  }

  const mergedDestination = mergeBatchesByExpiry([...params.destination, ...moved]);
  return {
    moved,
    remainingSource: mergeBatchesByExpiry(leftover),
    nextDestination: mergedDestination,
  };
}
