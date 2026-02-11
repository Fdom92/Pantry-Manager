import { collectBatches } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import type { QuickEditPatch } from '@core/models/up-to-date';
import { normalizeTrim } from '@core/utils/normalization.util';
import { toDateInputValue, toIsoDate } from '@core/utils/date.util';

export function hasAnyExpiryDate(item: PantryItem): boolean {
  return collectBatches(item.batches ?? []).some(batch => Boolean(batch.expirationDate));
}

export function getFirstExpiryDateInput(item: PantryItem | null): string {
  if (!item) {
    return '';
  }
  for (const batch of collectBatches(item.batches ?? [])) {
    const iso = normalizeTrim(batch.expirationDate);
    if (iso) {
      return toDateInputValue(iso);
    }
  }
  return '';
}

export function applyQuickEdit(params: {
  item: PantryItem;
  patch: QuickEditPatch;
  nowIso: string;
}): PantryItem {
  const { item, patch, nowIso } = params;
  const nextCategory = patch.needsCategory
    ? normalizeTrim(patch.categoryId)
    : normalizeTrim(item.categoryId);
  const nextBatches = Array.isArray(item.batches) ? item.batches.map(batch => ({ ...batch })) : [];

  if (patch.needsExpiry) {
    if (!patch.hasExpiry) {
      return {
        ...item,
        categoryId: nextCategory,
        batches: nextBatches,
        noExpiry: true,
        updatedAt: nowIso,
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
    updatedAt: nowIso,
  };
}
