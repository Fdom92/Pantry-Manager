import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import { ExpirationStatus } from '@core/models';
import type { BatchIdGenerator, ExpiryClassification, ItemBatch, PantryItem, ProductStatusState } from '@core/models/pantry';
import { roundQuantity } from '@core/utils/formatting.util';
import { normalizeLowercase, normalizeOptionalTrim, normalizeSupermarketValue, normalizeTrim } from '@core/utils/normalization.util';


export function normalizeFastAddQuantity(value: string | number | undefined): number {
  if (typeof value === 'number') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
  }
  if (typeof value === 'string') {
    const normalized = normalizeTrim(value.replace(',', '.'));
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
  const normalizedName = normalizeTrim(params.name) || UNASSIGNED_PRODUCT_NAME;
  const sanitizedQuantity = normalizeFastAddQuantity(params.quantity);
  const roundedQuantity = roundQuantity(Math.max(1, sanitizedQuantity));

  const batch: ItemBatch = {
    quantity: roundedQuantity,
    locationId: normalizeTrim(params.defaultLocationId) || undefined,
  };
  const batches: ItemBatch[] = [batch];

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

export function computeSupermarketSuggestions(items: PantryItem[]): string[] {
  const options = new Map<string, string>();
  for (const item of items) {
    const normalizedValue = normalizeSupermarketValue(item.supermarket);
    if (!normalizedValue) {
      continue;
    }
    const key = normalizeLowercase(normalizedValue);
    if (!options.has(key)) {
      options.set(key, normalizedValue);
    }
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
}

export function formatSupermarketLabel(value: string, otherLabel?: string): string {
  const trimmed = normalizeTrim(value);
  const normalized = normalizeLowercase(trimmed);
  if (normalized === 'otro') {
    return otherLabel ?? trimmed;
  }
  return trimmed;
}

export function buildUniqueSelectOptions(
  values: Array<string | null | undefined>,
  config?: { labelFor?: (value: string) => string }
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];

  for (const value of values) {
    const trimmed = normalizeTrim(value);
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeLowercase(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({ value: trimmed, label: config?.labelFor ? config.labelFor(trimmed) : trimmed });
  }

  return options;
}

export function collectBatches(
  batches: ItemBatch[],
  options?: { generateBatchId?: BatchIdGenerator }
): ItemBatch[] {
  const normalized: ItemBatch[] = [];
  for (const batch of batches ?? []) {
    if (!batch) {
      continue;
    }
    normalized.push({
      ...batch,
      quantity: toNumberOrZero(batch.quantity),
      batchId: batch.batchId ?? options?.generateBatchId?.(),
      opened: batch.opened ?? false,
      locationId: normalizeOptionalTrim(batch.locationId),
    });
  }
  return normalized;
}

export function hasOpenBatch(item: PantryItem): boolean {
  return collectBatches(item.batches ?? []).some(batch => Boolean(batch.opened));
}

export function computeExpirationStatus(
  batches: ItemBatch[],
  now: Date,
  windowDays: number
): ExpirationStatus {
  let status = ExpirationStatus.OK;
  for (const batch of collectBatches(batches)) {
    const classification = classifyExpiry(batch.expirationDate, now, windowDays);
    if (classification === 'expired') {
      return ExpirationStatus.EXPIRED;
    }
    if (classification === 'near-expiry') {
      status = ExpirationStatus.NEAR_EXPIRY;
    }
  }
  return status;
}

export function isItemLowStock(item: PantryItem, context?: { totalQuantity?: number; minThreshold?: number | null }): boolean {
  const totalQuantity =
    context && typeof context.totalQuantity === 'number' ? context.totalQuantity : sumQuantities(item.batches ?? []);
  const minThreshold =
    context && typeof context.minThreshold === 'number'
      ? context.minThreshold
      : toNumberOrZero(item.minThreshold);

  return minThreshold > 0 && totalQuantity < minThreshold;
}

export function getItemStatusState(
  item: PantryItem,
  now: Date,
  windowDays: number,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): ProductStatusState {
  const expirationStatus = computeExpirationStatus(item.batches ?? [], now, windowDays);
  if (expirationStatus === ExpirationStatus.EXPIRED) {
    return 'expired';
  }
  if (expirationStatus === ExpirationStatus.NEAR_EXPIRY) {
    return 'near-expiry';
  }
  if (isItemLowStock(item, context)) {
    return 'low-stock';
  }
  return 'normal';
}

export function shouldAutoAddToShoppingList(
  item: PantryItem,
  context?: { totalQuantity?: number; minThreshold?: number | null }
): boolean {
  if (!item || !item.isBasic) {
    return false;
  }

  const totalQuantity =
    context && typeof context.totalQuantity === 'number' ? context.totalQuantity : sumQuantities(item.batches ?? []);

  const hasMinThresholdOverride = Boolean(context && 'minThreshold' in context);
  const minThreshold = hasMinThresholdOverride
    ? context?.minThreshold ?? null
    : item.minThreshold != null
      ? Number(item.minThreshold)
      : null;

  if (totalQuantity <= 0) {
    return true;
  }

  if (minThreshold != null && totalQuantity < minThreshold) {
    return true;
  }

  return false;
}

export function toNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function sumQuantities(
  batches: ItemBatch[] | undefined,
  options?: { round?: (value: number) => number }
): number {
  if (!Array.isArray(batches) || batches.length === 0) {
    return 0;
  }
  const total = batches.reduce((sum, batch) => sum + toNumberOrZero(batch.quantity), 0);
  return options?.round ? options.round(total) : total;
}

/**
 * Merge batches that share the same expiration date so duplicate entries collapse automatically.
 * Returns a new array without mutating the input batches.
 */
export function mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length <= 1) {
    return Array.isArray(batches) ? batches.map(batch => ({ ...batch })) : [];
  }

  const seen = new Map<string, ItemBatch>();
  const merged: ItemBatch[] = [];

  for (const batch of batches) {
    const expiryKey = normalizeTrim(batch.expirationDate);
    const locationKey = normalizeTrim(batch.locationId);
    const key = expiryKey ? `${locationKey}::${expiryKey}` : '';
    if (!key) {
      merged.push({ ...batch });
      continue;
    }

    const existing = seen.get(key);
    if (!existing) {
      const clone = { ...batch };
      seen.set(key, clone);
      merged.push(clone);
      continue;
    }

    existing.quantity = toNumberOrZero(existing.quantity) + toNumberOrZero(batch.quantity);
    existing.opened = Boolean(existing.opened || batch.opened);
  }

  return merged;
}

export function normalizeBatches(
  batches: ItemBatch[] | undefined,
  options?: { generateBatchId?: BatchIdGenerator }
): ItemBatch[] {
  if (!Array.isArray(batches) || batches.length === 0) {
    return [];
  }

  const normalized = batches.map(batch => ({
    ...batch,
    batchId: batch.batchId ?? options?.generateBatchId?.(),
    quantity: toNumberOrZero(batch.quantity),
    opened: batch.opened ?? false,
  }));

  return mergeBatchesByExpiry(normalized);
}

export function computeEarliestExpiry(batches: ItemBatch[]): string | undefined {
  const dates: string[] = [];
  for (const batch of batches ?? []) {
    if (batch?.expirationDate) {
      dates.push(batch.expirationDate);
    }
  }

  if (dates.length === 0) {
    return undefined;
  }

  return dates.reduce((earliest, current) => {
    if (!earliest) {
      return current;
    }
    return new Date(current) < new Date(earliest) ? current : earliest;
  });
}

export function classifyExpiry(expirationDate: string | undefined | null, now: Date, windowDays: number): ExpiryClassification {
  if (!expirationDate) {
    return 'unknown';
  }

  const exp = new Date(expirationDate);
  if (!Number.isFinite(exp.getTime())) {
    return 'unknown';
  }

  const reference = new Date(now);
  reference.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);

  if (exp < reference) {
    return 'expired';
  }

  const diff = exp.getTime() - reference.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days >= 0 && days <= windowDays) {
    return 'near-expiry';
  }

  return 'normal';
}
