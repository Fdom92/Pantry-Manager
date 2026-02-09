import type { PantryItem, ItemBatch } from '@core/models/pantry';

function normalizeBatches(batches: ItemBatch[] = []): ItemBatch[] {
  return [...batches].map(batch => ({ ...batch })).sort((a, b) => {
    const keyA = `${a.batchId ?? ''}::${a.expirationDate ?? ''}::${a.quantity ?? ''}`;
    const keyB = `${b.batchId ?? ''}::${b.expirationDate ?? ''}::${b.quantity ?? ''}`;
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
