import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { roundQuantity, toNumberOrZero } from '@core/utils/formatting.util';
import { normalizeTrim } from '@core/utils/normalization.util';
import { inferExpiryForName } from './food-type-inference.domain';
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
  /**
   * Whether to derive an expiry date from the product name when the caller
   * passes none. Defaults to true.
   *
   * Callers that already resolved the date with the user — the add modal shows
   * the suggestion in an editable chip — must pass false, so that a blank there
   * reads as "the user removed it" rather than "nobody set one". Without this,
   * clearing the chip would be silently undone here.
   */
  inferExpiry?: boolean;
}): PantryItem {
  const normalizedName = normalizeTrim(params.name) || UNASSIGNED_PRODUCT_NAME;

  // Normalize quantity: accept comma-decimal strings, guard against 0/negative/NaN
  const rawQty = typeof params.quantity === 'string'
    ? normalizeTrim(params.quantity.replace(',', '.'))
    : params.quantity;
  const sanitizedQuantity = Math.max(1, toNumberOrZero(rawQty));

  // Infer the food type from the name so the item is visible to the expiry
  // alert system from day one. An explicit date or an explicit noExpiry from
  // the caller always wins; an unrecognised name falls back to no date, which
  // is the behaviour this function had before inference existed.
  const inferred = inferExpiryForName(normalizedName, new Date(params.nowIso));
  const shouldInferDate =
    params.inferExpiry !== false && !params.expirationDate && !params.noExpiry;

  const batches: ItemBatch[] = [
    {
      quantity: roundQuantity(Math.max(1, sanitizedQuantity)),
      locationId: normalizeTrim(params.defaultLocationId ?? '') || undefined,
      expirationDate: params.expirationDate ?? (shouldInferDate ? inferred.expirationDate : undefined),
      noExpiry: params.noExpiry || undefined,
    },
  ];

  return {
    _id: params.id,
    type: 'item',
    householdId: params.householdId ?? DEFAULT_HOUSEHOLD_ID,
    name: normalizedName,
    categoryId: '',
    foodType: inferred.foodType ?? undefined,
    batches,
    supermarket: '',
    isBasic: undefined,
    minThreshold: undefined,
    expirationDate: computeEarliestExpiry(batches),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}
