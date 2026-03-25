import type { PantryItem } from './item.model';

export type BatchEditFilter = 'noFoodType' | 'noCategory' | 'noExpiryDateSingleBatch';
export type BatchEditAction = 'setFoodType' | 'setCategory' | 'setExpiryDate';

/** Sentinel value used in itemValues map to indicate "intentionally no expiry date" */
export const NO_EXPIRY_SENTINEL = '__no_expiry__';

export interface BatchEditFlowConfig {
  filter: BatchEditFilter;
  action?: BatchEditAction;
}

export function applyBatchEditFilter(items: PantryItem[], filter: BatchEditFilter): PantryItem[] {
  switch (filter) {
    case 'noFoodType': return items.filter(i => !i.foodType);
    case 'noCategory': return items.filter(i => !i.categoryId);
    case 'noExpiryDateSingleBatch': return items.filter(i =>
      i.batches?.length === 1 && !i.batches[0].expirationDate && !i.batches[0].noExpiry
    );
  }
}
