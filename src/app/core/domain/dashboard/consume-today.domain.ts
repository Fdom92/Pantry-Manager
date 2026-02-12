import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';

export interface ConsumeResult {
  updatedItem: PantryItem;
  consumedAmount: number;
}

/**
 * Apply consume today operation to item batches.
 * Consumes from earliest expiring batches first (FIFO).
 */
export function applyConsumeTodayToBatches(
  item: PantryItem,
  amount: number
): ConsumeResult | null {
  const delta = toNumberOrZero(amount);
  if (delta <= 0) return null;

  const nextBatches = (item.batches ?? []).map(batch => ({ ...batch }));
  const ordered = nextBatches
    .map((batch, index) => ({ batch, index }))
    .filter(entry => toNumberOrZero(entry.batch.quantity) > 0)
    .sort((a, b) => {
      const left = getExpiryTimestamp(a.batch.expirationDate);
      const right = getExpiryTimestamp(b.batch.expirationDate);
      if (left === right) return a.index - b.index;
      return left - right;
    });

  if (!ordered.length) return null;

  let remaining = delta;
  for (const entry of ordered) {
    if (remaining <= 0) break;
    const quantity = toNumberOrZero(entry.batch.quantity);
    if (quantity <= 0) continue;

    if (quantity <= remaining + 1e-9) {
      remaining -= quantity;
      entry.batch.quantity = 0;
    } else {
      entry.batch.quantity = quantity - remaining;
      remaining = 0;
    }
  }

  return {
    updatedItem: {
      ...item,
      batches: nextBatches.filter(batch => toNumberOrZero(batch.quantity) > 0),
    },
    consumedAmount: delta - remaining,
  };
}

/**
 * Get timestamp for batch expiration date (or infinity if none).
 */
function getExpiryTimestamp(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
