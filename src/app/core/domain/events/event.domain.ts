import type { EventQuantities, QuantityInput } from '@core/models/events';
import { normalizeWhitespace } from '@core/utils/normalization.util';

/**
 * Computes the number of full days between the event timestamp and the batch expiry date.
 * Returns undefined when either date is missing.
 * A negative value means the batch was already expired at the time of the event.
 */
export function computeDaysToExpiry(expirationDate: string | undefined, timestamp: string): number | undefined {
  if (!expirationDate) return undefined;
  const expiryMs = Date.parse(expirationDate);
  const eventMs = Date.parse(timestamp);
  if (!Number.isFinite(expiryMs) || !Number.isFinite(eventMs)) return undefined;
  return Math.floor((expiryMs - eventMs) / 86_400_000);
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
