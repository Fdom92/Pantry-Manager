import { classifyExpiry } from '@core/domain/pantry';
import type { PantryEvent } from '@core/models/events';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { normalizeTrim } from '@core/utils/normalization.util';
import { buildExpireBatchKey } from './event.domain';

/** A batch that has expired and has no EXPIRE event recorded for it yet. */
export interface UnloggedExpiredBatch {
  item: PantryItem;
  batch: ItemBatch;
  /** Identity written into the event, so the next sweep recognises it. */
  batchKey: string;
  quantity: number;
}

/**
 * Which batch of a fresh product is "the same batch" cannot be answered with its
 * batchId: a fresh product keeps a single lot that is regenerated on every
 * consolidation, so the id changes while the thing on the shelf does not. Keying
 * on the date instead is what stops the same lettuce being recorded as expired
 * again after any edit.
 */
function batchKeyFor(item: PantryItem, batch: ItemBatch): string | null {
  return item.productType === 'fresh'
    ? `${item._id}::${normalizeTrim(batch.expirationDate)}`
    : buildExpireBatchKey(item._id, batch);
}

/**
 * Every key an existing EXPIRE event can be recognised by. Events written before
 * the key was stored in `sourceMetadata` only carry the product and the date, and
 * those still have to suppress a re-log.
 */
function seenKeys(previousEvents: PantryEvent[]): Set<string> {
  const seen = new Set<string>();
  for (const event of previousEvents) {
    const stored = normalizeTrim(String(event.sourceMetadata?.['batchKey'] ?? ''));
    if (stored) {
      seen.add(stored);
    }
    if (event.productId && event.expirationDate) {
      seen.add(`${event.productId}::${normalizeTrim(event.expirationDate)}`);
    }
  }
  return seen;
}

/**
 * EXPIRE events that repeat a batch already recorded, keeping the oldest one per
 * batch. Up to 5.6 the sweep could only see 25 past events, so it re-logged the
 * same batches on every pantry load; this is what lets the app heal that history.
 */
export function selectDuplicateExpireEvents(events: PantryEvent[]): PantryEvent[] {
  const oldestFirst = [...events].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const seen = new Set<string>();
  const duplicates: PantryEvent[] = [];
  for (const event of oldestFirst) {
    const date = normalizeTrim(event.expirationDate);
    const key = normalizeTrim(String(event.sourceMetadata?.['batchKey'] ?? '')) || (date ? `${event.productId}::${date}` : '');
    if (!key) continue; // nothing to tell it apart by: never delete it
    if (seen.has(key)) duplicates.push(event);
    else seen.add(key);
  }
  return duplicates;
}

/**
 * Decides which expired batches still need an EXPIRE event, given what has
 * already been recorded.
 *
 * A batch qualifies when it has a date, that date has passed, something is still
 * left in it, and nothing already logged claims its identity — including
 * anything selected earlier in this same sweep, so one call never returns the
 * same key twice.
 */
export function selectUnloggedExpiredBatches(
  items: PantryItem[],
  previousEvents: PantryEvent[],
  now: Date,
): UnloggedExpiredBatch[] {
  const seen = seenKeys(previousEvents);
  const selected: UnloggedExpiredBatch[] = [];

  for (const item of items) {
    for (const batch of item.batches ?? []) {
      if (!batch?.expirationDate) continue;
      if (classifyExpiry(batch.expirationDate, now, 0) !== 'expired') continue;

      const batchKey = batchKeyFor(item, batch);
      if (!batchKey || seen.has(batchKey)) continue;

      const quantity = Number.isFinite(batch.quantity) ? batch.quantity : 0;
      if (quantity <= 0) continue;

      seen.add(batchKey);
      selected.push({ item, batch, batchKey, quantity });
    }
  }

  return selected;
}
