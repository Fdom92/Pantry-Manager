import type { ItemLocationStock, PantryItem } from '@core/models/pantry';

export function compareIsoDatesNewestFirst(a?: string, b?: string): number {
  const aTime = a ? new Date(a).getTime() : Number.NEGATIVE_INFINITY;
  const bTime = b ? new Date(b).getTime() : Number.NEGATIVE_INFINITY;
  return bTime - aTime;
}

export function getRecentItemsByUpdatedAt(items: PantryItem[], limit: number = 5): PantryItem[] {
  return [...(items ?? [])]
    .sort((left, right) => compareIsoDatesNewestFirst(left.updatedAt, right.updatedAt))
    .slice(0, Math.max(0, limit));
}

export function getLocationQuantity(location: ItemLocationStock): number {
  const batches = Array.isArray(location?.batches) ? location.batches : [];
  return batches.reduce((sum, batch) => sum + toFiniteNumber(batch?.quantity), 0);
}

export function getLocationEarliestExpiry(location: ItemLocationStock): string | undefined {
  const batches = Array.isArray(location?.batches) ? location.batches : [];
  const dates = batches
    .map(batch => batch?.expirationDate)
    .filter((date): date is string => Boolean(date));
  if (!dates.length) {
    return undefined;
  }
  return dates.reduce((earliest, current) => {
    if (!earliest) {
      return current;
    }
    return new Date(current) < new Date(earliest) ? current : earliest;
  });
}

function toFiniteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
