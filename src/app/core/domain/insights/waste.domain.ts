import type { PantryEvent } from '@core/models/events';
import type { FoodType } from '@core/models/shared/enums.model';

/**
 * "Se te han caducado N productos" for the last `windowDays`: distinct products with a
 * batch that expired while it still had stock. Counts products, not units —
 * 6 yogures + 4 huevos are 2 products (it summed units until 5.5).
 */
export interface WasteSummary {
  windowDays: number;
  totalCount: number;
  byCategory: Array<{ categoryId: string; count: number }>;
  byFoodType: Array<{ foodType: FoodType; count: number }>;
  previousWindowCount: number;
  trend: 'up' | 'down' | 'flat';
}

const MS_PER_DAY = 86_400_000;

export function computeWasteSummary(
  events: ReadonlyArray<PantryEvent>,
  now: Date,
  windowDays: number,
): WasteSummary {
  const nowMs = now.getTime();
  const windowStart = nowMs - windowDays * MS_PER_DAY;
  const prevStart = windowStart - windowDays * MS_PER_DAY;

  // productId → its latest expired event in the window (for category/foodType)
  const inWindow = new Map<string, PantryEvent>();
  const inPrevious = new Set<string>();

  for (const e of events) {
    if (e.eventType !== 'EXPIRE') continue;
    if (!(Number.isFinite(e.quantity) && e.quantity > 0)) continue;
    const t = new Date(e.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= windowStart && t <= nowMs) {
      inWindow.set(e.productId, e);
    } else if (t >= prevStart && t < windowStart) {
      inPrevious.add(e.productId);
    }
  }

  const byCategoryMap = new Map<string, number>();
  const byFoodTypeMap = new Map<FoodType, number>();
  for (const e of inWindow.values()) {
    if (e.categoryId) byCategoryMap.set(e.categoryId, (byCategoryMap.get(e.categoryId) ?? 0) + 1);
    if (e.foodType) byFoodTypeMap.set(e.foodType, (byFoodTypeMap.get(e.foodType) ?? 0) + 1);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([categoryId, count]) => ({ categoryId, count }))
    .sort((a, b) => b.count - a.count);
  const byFoodType = [...byFoodTypeMap.entries()]
    .map(([foodType, count]) => ({ foodType, count }))
    .sort((a, b) => b.count - a.count);

  const totalCount = inWindow.size;
  const previousWindowCount = inPrevious.size;
  let trend: WasteSummary['trend'] = 'flat';
  if (totalCount > previousWindowCount) trend = 'up';
  else if (totalCount < previousWindowCount) trend = 'down';

  return { windowDays, totalCount, byCategory, byFoodType, previousWindowCount, trend };
}
