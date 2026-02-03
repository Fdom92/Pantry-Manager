import { collectBatches } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import type { QuickEditPatch } from '@core/models/up-to-date';

export function normalizeId(value?: string | null): string {
  return (value ?? '').trim();
}

export function hasAnyExpiryDate(item: PantryItem): boolean {
  return collectBatches(item.batches ?? []).some(batch => Boolean(batch.expirationDate));
}

export function toDateInputValue(dateIso: string): string {
  try {
    return new Date(dateIso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function getFirstExpiryDateInput(item: PantryItem | null): string {
  if (!item) {
    return '';
  }
  for (const batch of collectBatches(item.batches ?? [])) {
    const iso = normalizeId(batch.expirationDate);
    if (iso) {
      return toDateInputValue(iso);
    }
  }
  return '';
}

export function toIsoDate(dateInput: string): string | null {
  const trimmed = dateInput.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function applyQuickEdit(params: {
  item: PantryItem;
  patch: QuickEditPatch;
  primaryUnit: string;
}): PantryItem {
  const { item, patch } = params;
  const nextCategory = patch.needsCategory ? patch.categoryId.trim() : (item.categoryId ?? '').trim();
  const nextBatches = Array.isArray(item.batches) ? item.batches.map(batch => ({ ...batch })) : [];

  if (patch.needsExpiry) {
    if (!patch.hasExpiry) {
      return {
        ...item,
        categoryId: nextCategory,
        batches: nextBatches,
        noExpiry: true,
        updatedAt: new Date().toISOString(),
      };
    }

    const iso = toIsoDate(patch.expiryDateInput);
    if (iso) {
      const batchIndex = nextBatches.findIndex(batch => !batch.expirationDate);
      if (batchIndex >= 0) {
        nextBatches[batchIndex] = { ...nextBatches[batchIndex], expirationDate: iso };
      } else {
        nextBatches.push({
          quantity: 0,
          unit: params.primaryUnit,
          expirationDate: iso,
        });
      }
    }
  }

  return {
    ...item,
    categoryId: nextCategory,
    batches: nextBatches,
    noExpiry: patch.needsExpiry ? false : item.noExpiry,
    updatedAt: new Date().toISOString(),
  };
}
