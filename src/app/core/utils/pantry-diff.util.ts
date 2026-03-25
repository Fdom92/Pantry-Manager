import type { PantryItem, ItemBatch } from '@core/models/pantry';

function normalizeBatches(batches: ItemBatch[] = []): ItemBatch[] {
  const stableKey = (value: ItemBatch): string => {
    const sortedKeys = Object.keys(value as unknown as Record<string, unknown>).sort();
    return JSON.stringify(value, sortedKeys);
  };
  return [...batches].map(batch => ({ ...batch })).sort((a, b) => {
    const keyA = stableKey(a);
    const keyB = stableKey(b);
    return keyA.localeCompare(keyB);
  });
}

export function hasMeaningfulItemChanges(previous: PantryItem, next: PantryItem): boolean {
  const stripMeta = (value: PantryItem) => {
    const { _id, _rev, createdAt, updatedAt, ...rest } = value as any;
    return { ...rest, batches: normalizeBatches(value.batches ?? []) };
  };
  return JSON.stringify(stripMeta(previous)) !== JSON.stringify(stripMeta(next));
}

/**
 * Returns true if any batch has a changed expirationDate, locationId, or opened flag
 * (ignoring quantity changes, which are tracked via ADD/CONSUME events).
 */
export function hasBatchMetadataChanged(prev: ItemBatch[], next: ItemBatch[]): boolean {
  const prevMap = new Map(prev.map(b => [b.batchId, b]));
  for (const batch of next) {
    const prevBatch = prevMap.get(batch.batchId ?? '');
    if (!prevBatch) {
      continue;
    }
    if (prevBatch.expirationDate !== batch.expirationDate) {
      return true;
    }
    if ((prevBatch.locationId ?? '') !== (batch.locationId ?? '')) {
      return true;
    }
    if (!!prevBatch.opened !== !!batch.opened) {
      return true;
    }
  }
  return false;
}
