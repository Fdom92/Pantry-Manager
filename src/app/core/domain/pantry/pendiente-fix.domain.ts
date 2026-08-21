import type { ItemBatch, PantryItem } from '@core/models/pantry';
import type { FoodType } from '@core/models/shared/enums.model';

export interface PendienteFix {
  foodType?: FoodType;
  expirationDate?: string;
  noExpiry?: boolean;
}

export interface PendienteRowReadiness {
  needsFoodType: boolean;
  needsDate: boolean;
  foodType: FoodType | null;
  expirationDate: string | undefined;
  noExpiry: boolean;
}

/**
 * A pendientes bulk-fix row is ready to save once every dimension it needs has
 * a value — whether the user picked it explicitly or it was pre-filled as a
 * suggestion (e.g. an auto-suggested date once foodType is known). This is
 * deliberately NOT the same as "the user touched this row": an untouched but
 * fully pre-filled row is still save-ready, so a bulk "accept the suggestions"
 * save doesn't require re-tapping every row that already has good defaults.
 */
export function isPendienteRowResolved(row: PendienteRowReadiness): boolean {
  const foodTypeReady = !row.needsFoodType || row.foodType !== null;
  const dateReady = !row.needsDate || row.expirationDate !== undefined || row.noExpiry;
  return foodTypeReady && dateReady;
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
