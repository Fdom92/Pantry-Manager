import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { roundQuantity } from '@core/utils/formatting.util';
import { normalizeTrim } from '@core/utils/normalization.util';
import { computeEarliestExpiry } from './pantry-batch.domain';

export function buildFastAddItemPayload(params: {
  id: string;
  nowIso: string;
  name: string;
  quantity: number | string;
  defaultLocationId?: string;
  householdId?: string;
}): PantryItem {
  const normalizedName = normalizeTrim(params.name) || UNASSIGNED_PRODUCT_NAME;

  // Inline normalizeFastAddQuantity logic
  let sanitizedQuantity = 1;
  if (typeof params.quantity === 'number') {
    const numericValue = Number(params.quantity);
    sanitizedQuantity = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
  } else if (typeof params.quantity === 'string') {
    const normalized = normalizeTrim(params.quantity.replace(',', '.'));
    const numericValue = Number(normalized);
    sanitizedQuantity = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
  }

  const batches: ItemBatch[] = [
    {
      quantity: roundQuantity(Math.max(1, sanitizedQuantity)),
      locationId: normalizeTrim(params.defaultLocationId ?? '') || undefined,
    },
  ];

  return {
    _id: params.id,
    type: 'item',
    householdId: params.householdId ?? DEFAULT_HOUSEHOLD_ID,
    name: normalizedName,
    categoryId: '',
    batches,
    supermarket: '',
    isBasic: undefined,
    minThreshold: undefined,
    expirationDate: computeEarliestExpiry(batches),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}
