import type { BatchIdGenerator, ItemBatch } from '@core/models/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { normalizeOptionalTrim, normalizeTrim } from '@core/utils/normalization.util';

export function collectBatches(
  batches: ItemBatch[] | undefined,
  options?: { generateBatchId?: BatchIdGenerator }
): ItemBatch[] {
  const normalized: ItemBatch[] = [];
  for (const batch of batches ?? []) {
    if (!batch) {
      continue;
    }
    normalized.push({
      ...batch,
      quantity: toNumberOrZero(batch.quantity),
      batchId: batch.batchId ?? options?.generateBatchId?.(),
      opened: batch.opened ?? false,
      locationId: normalizeOptionalTrim(batch.locationId),
    });
  }
  return normalized;
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
 * Merge batches that share the same expiration date and location.
 * Returns a new array without mutating the input batches.
 */
export function mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length <= 1) {
    return Array.isArray(batches) ? batches.map(batch => ({ ...batch })) : [];
  }

  const seen = new Map<string, ItemBatch>();
  const merged: ItemBatch[] = [];

  for (const batch of batches) {
    const expiryKey = normalizeTrim(batch.expirationDate);
    const locationKey = normalizeTrim(batch.locationId);
    const key = expiryKey ? `${locationKey}::${expiryKey}` : '';

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
  options?: { generateBatchId?: BatchIdGenerator }
): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length === 0) {
    return [];
  }

  const normalized = batches.map(batch => ({
    ...batch,
    batchId: batch.batchId ?? options?.generateBatchId?.(),
    quantity: toNumberOrZero(batch.quantity),
    opened: batch.opened ?? false,
  }));

  return mergeBatchesByExpiry(normalized);
}

export function computeEarliestExpiry(batches: ItemBatch[] | undefined): string | undefined {
  const dates: string[] = [];
  for (const batch of batches ?? []) {
    if (batch?.expirationDate) {
      dates.push(batch.expirationDate);
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
