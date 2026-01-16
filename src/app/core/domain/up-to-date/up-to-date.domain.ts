import { UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { collectBatches } from '@core/domain/pantry';
import type { ItemLocationStock, PantryItem } from '@core/models/pantry';
import type { QuickEditPatch } from '@core/models/up-to-date';

export function normalizeId(value?: string | null): string {
  return (value ?? '').trim();
}

export function isUnassignedLocationId(value?: string | null): boolean {
  const id = normalizeId(value).toLowerCase();
  return !id || id === UNASSIGNED_LOCATION_KEY;
}

export function hasRealLocation(item: PantryItem): boolean {
  return item.locations?.some(location => !isUnassignedLocationId(location.locationId)) ?? false;
}

export function getFirstRealLocationId(item: PantryItem | null): string {
  if (!item) {
    return '';
  }
  const location = item.locations?.find(l => !isUnassignedLocationId(l.locationId));
  return normalizeId(location?.locationId);
}

export function hasAnyExpiryDate(item: PantryItem): boolean {
  return collectBatches(item.locations ?? []).some(batch => Boolean(batch.expirationDate));
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
  for (const batch of collectBatches(item.locations ?? [])) {
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
  const nextLocations: ItemLocationStock[] = Array.isArray(item.locations) ? item.locations.map(location => ({ ...location })) : [];

  if (patch.needsLocation) {
    const normalizedLocation = patch.locationId.trim();
    const index = nextLocations.findIndex(location => isUnassignedLocationId(location.locationId));
    if (index >= 0) {
      nextLocations[index].locationId = normalizedLocation;
    } else if (nextLocations.length > 0) {
      nextLocations[0].locationId = normalizedLocation;
    } else {
      nextLocations.push({
        locationId: normalizedLocation,
        unit: params.primaryUnit,
        batches: [],
      });
    }
  }

  if (patch.needsExpiry) {
    if (!patch.hasExpiry) {
      return {
        ...item,
        categoryId: nextCategory,
        locations: nextLocations,
        noExpiry: true,
        updatedAt: new Date().toISOString(),
      };
    }

    const iso = toIsoDate(patch.expiryDateInput);
    if (iso) {
      if (!nextLocations.length) {
        nextLocations.push({
          locationId: UNASSIGNED_LOCATION_KEY,
          unit: params.primaryUnit,
          batches: [],
        });
      }
      const target = nextLocations[0];
      const batches = Array.isArray(target.batches) ? [...target.batches] : [];
      const batchIndex = batches.findIndex(batch => !batch.expirationDate);
      if (batchIndex >= 0) {
        batches[batchIndex] = { ...batches[batchIndex], expirationDate: iso };
      } else {
        batches.push({
          quantity: 0,
          unit: target.unit,
          expirationDate: iso,
        });
      }
      nextLocations[0] = { ...target, batches };
    }
  }

  return {
    ...item,
    categoryId: nextCategory,
    locations: nextLocations,
    noExpiry: patch.needsExpiry ? false : item.noExpiry,
    updatedAt: new Date().toISOString(),
  };
}
