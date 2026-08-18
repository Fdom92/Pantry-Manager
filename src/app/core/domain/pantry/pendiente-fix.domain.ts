import type { ItemBatch, PantryItem } from '@core/models/pantry';
import type { FoodType } from '@core/models/shared/enums.model';

export interface PendienteFix {
  foodType?: FoodType;
  expirationDate?: string;
  noExpiry?: boolean;
}

/**
 * Applies a pendientes bulk-fix row's edits to a PantryItem:
 * - foodType (if provided) replaces the item's foodType.
 * - expirationDate/noExpiry (if either provided) is applied to every batch
 *   that is currently missing a date and not already marked noExpiry —
 *   batches that already have a date, or are already noExpiry, are left as-is.
 */
export function applyPendienteFix(item: PantryItem, fix: PendienteFix): PantryItem {
  const shouldUpdateBatches = fix.expirationDate !== undefined || fix.noExpiry !== undefined;

  const batches: ItemBatch[] = shouldUpdateBatches
    ? item.batches.map(batch =>
        !batch.expirationDate && !batch.noExpiry
          ? { ...batch, expirationDate: fix.expirationDate, noExpiry: fix.noExpiry || undefined }
          : batch
      )
    : item.batches;

  return {
    ...item,
    foodType: fix.foodType ?? item.foodType,
    batches,
  };
}
