import type { PantryItem } from '@core/models/pantry';

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
