import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { roundQuantity, toNumberOrZero } from '@core/utils/formatting.util';
import { normalizeTrim } from '@core/utils/normalization.util';
import { computeEarliestExpiry } from './pantry-batch.domain';

export function buildAddItemPayload(params: {
  id: string;
  nowIso: string;
  name: string;
  quantity: number | string;
  defaultLocationId?: string;
  householdId?: string;
  expirationDate?: string;
  noExpiry?: boolean;
}): PantryItem {
  const normalizedName = normalizeTrim(params.name) || UNASSIGNED_PRODUCT_NAME;

  // Normalize quantity: accept comma-decimal strings, guard against 0/negative/NaN
  const rawQty = typeof params.quantity === 'string'
    ? normalizeTrim(params.quantity.replace(',', '.'))
    : params.quantity;
  const sanitizedQuantity = Math.max(1, toNumberOrZero(rawQty));

  const batches: ItemBatch[] = [
    {
      quantity: roundQuantity(Math.max(1, sanitizedQuantity)),
      locationId: normalizeTrim(params.defaultLocationId ?? '') || undefined,
      expirationDate: params.expirationDate ?? undefined,
      noExpiry: params.noExpiry || undefined,
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
