export * from './pantry-catalog';
export {
  collectBatches,
  computeExpirationStatus,
  getItemEarliestExpiry,
  getItemQuantityByLocation,
  getItemTotalMinThreshold,
  getItemTotalQuantity,
  hasOpenBatch,
  isItemExpired,
  isItemLowStock,
  isItemNearExpiry,
  shouldAutoAddToShoppingList
} from './pantry-item';
export * from './pantry-stock';

import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import { computeEarliestExpiry } from '@core/domain/pantry/pantry-stock';
import type { ItemBatch, ItemLocationStock, PantryItem } from '@core/models/pantry';
import { MeasurementUnit } from '@core/models/shared';
import { roundQuantity } from '@core/utils/formatting.util';

export type FastAddEntry = { name: string; quantity: number };
export type BatchIdGenerator = () => string;

export function parseFastAddEntries(raw: string): FastAddEntry[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map(line => parseFastAddLine(line))
    .filter((entry): entry is FastAddEntry => entry !== null);
}

function parseFastAddLine(line: string): FastAddEntry | null {
  const trimmed = (line ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const leadingMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)(?:\s*[x×])?\s+(.+)$/i);
  if (leadingMatch) {
    return {
      name: (leadingMatch[2] ?? '').trim() || trimmed,
      quantity: normalizeFastAddQuantity(leadingMatch[1]),
    };
  }

  const trailingMultiplierMatch = trimmed.match(/^(.+?)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)$/i);
  if (trailingMultiplierMatch) {
    return {
      name: (trailingMultiplierMatch[1] ?? '').trim() || trimmed,
      quantity: normalizeFastAddQuantity(trailingMultiplierMatch[2]),
    };
  }

  const trailingNumberMatch = trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
  if (trailingNumberMatch) {
    return {
      name: (trailingNumberMatch[1] ?? '').trim() || trimmed,
      quantity: normalizeFastAddQuantity(trailingNumberMatch[2]),
    };
  }

  return {
    name: trimmed,
    quantity: 1,
  };
}

export function normalizeFastAddQuantity(value: string | number | undefined): number {
  if (typeof value === 'number') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
  }
  return 1;
}

export function buildFastAddItemPayload(params: {
  id: string;
  nowIso: string;
  name: string;
  quantity: number;
  defaultLocationId: string;
  householdId?: string;
}): PantryItem {
  const normalizedName = (params.name ?? '').trim() || UNASSIGNED_PRODUCT_NAME;
  const sanitizedQuantity = normalizeFastAddQuantity(params.quantity);
  const roundedQuantity = roundQuantity(Math.max(1, sanitizedQuantity));

  const batch: ItemBatch = {
    quantity: roundedQuantity,
    unit: MeasurementUnit.UNIT,
  };
  const locations: ItemLocationStock[] = [
    {
      locationId: params.defaultLocationId,
      unit: MeasurementUnit.UNIT,
      batches: [batch],
    },
  ];

  return {
    _id: params.id,
    type: 'item',
    householdId: params.householdId ?? DEFAULT_HOUSEHOLD_ID,
    name: normalizedName,
    categoryId: '',
    locations,
    supermarket: '',
    isBasic: undefined,
    minThreshold: undefined,
    expirationDate: computeEarliestExpiry(locations),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}
