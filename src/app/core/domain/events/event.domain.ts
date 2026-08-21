import type { EventQuantities, QuantityInput } from '@core/models/events';
import { normalizeWhitespace } from '@core/utils/normalization.util';
import { daysUntilExpiry } from '@core/utils/date.util';

/**
 * Days between the event and the batch's expiry date. Zero means the event
 * happened on the expiry day; a negative value means it was already past.
 * Undefined when either date is missing.
 *
 * Delegates to daysUntilExpiry rather than subtracting timestamps here. Doing
 * the arithmetic locally meant `Date.parse('2026-08-25')` — UTC midnight —
 * against a real instant, so every event came out a day early: consuming
 * something on its expiry date recorded -1, "already expired", and using it a
 * day ahead recorded 0. Waste tracking and the PRO signals were built on that.
 */
export function computeDaysToExpiry(expirationDate: string | undefined, timestamp: string): number | undefined {
  if (!expirationDate) return undefined;
  const eventMs = Date.parse(timestamp);
  if (!Number.isFinite(eventMs)) return undefined;
  const days = daysUntilExpiry(expirationDate, eventMs);
  return Number.isNaN(days) ? undefined : days;
}

export function buildEventQuantities(input: QuantityInput): EventQuantities {
  const quantity = Number.isFinite(input.quantity) ? (input.quantity as number) : 0;
  const previousQuantity = Number.isFinite(input.previousQuantity) ? input.previousQuantity : undefined;
  const nextQuantity = Number.isFinite(input.nextQuantity) ? input.nextQuantity : undefined;
  let deltaQuantity = Number.isFinite(input.deltaQuantity) ? input.deltaQuantity : undefined;

  if (deltaQuantity == null && previousQuantity != null && nextQuantity != null) {
    deltaQuantity = nextQuantity - previousQuantity;
  }

  return {
    quantity,
    deltaQuantity,
    previousQuantity,
    nextQuantity,
  };
}

/**
 * Builds a deduplication key for EXPIRE events.
 * Uses batchId when available; falls back to productId + expirationDate.
 * Returns null for batches with no identity (no batchId and no expirationDate).
 */
export function buildExpireBatchKey(
  productId: string,
  batch: { batchId?: string; expirationDate?: string }
): string | null {
  if (batch.batchId) return `${productId}::${batch.batchId}`;
  const expiry = normalizeWhitespace(batch.expirationDate);
  return expiry ? `${productId}::${expiry}` : null;
}
