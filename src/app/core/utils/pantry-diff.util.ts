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
