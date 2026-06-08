import type { PantryEvent } from '@core/models/events';
import type { FoodType } from '@core/models/shared/enums.model';

export interface WasteSummary {
  windowDays: number;
  totalCount: number;
  byCategory: Array<{ categoryId: string; count: number }>;
  byFoodType: Array<{ foodType: FoodType; count: number }>;
  topProduct?: { productId: string; productName: string; count: number };
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

  const inWindow: PantryEvent[] = [];
  let previousWindowCount = 0;

  for (const e of events) {
    if (e.eventType !== 'EXPIRE') continue;
    const t = new Date(e.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const q = Number.isFinite(e.quantity) ? e.quantity : 0;
    if (t >= windowStart && t <= nowMs) {
      inWindow.push(e);
    } else if (t >= prevStart && t < windowStart) {
      previousWindowCount += q;
    }
  }

  const byCategoryMap = new Map<string, number>();
  const byFoodTypeMap = new Map<FoodType, number>();
  const byProductMap = new Map<string, { productName: string; count: number }>();
  let totalCount = 0;

  for (const e of inWindow) {
    const q = Number.isFinite(e.quantity) ? e.quantity : 0;
    totalCount += q;
    if (e.categoryId) byCategoryMap.set(e.categoryId, (byCategoryMap.get(e.categoryId) ?? 0) + q);
    if (e.foodType)   byFoodTypeMap.set(e.foodType, (byFoodTypeMap.get(e.foodType) ?? 0) + q);
    const productName = e.productName ?? '';
    const existing = byProductMap.get(e.productId);
    if (existing) {
      existing.count += q;
    } else {
      byProductMap.set(e.productId, { productName, count: q });
    }
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([categoryId, count]) => ({ categoryId, count }))
    .sort((a, b) => b.count - a.count);
  const byFoodType = [...byFoodTypeMap.entries()]
    .map(([foodType, count]) => ({ foodType, count }))
    .sort((a, b) => b.count - a.count);

  let topProduct: WasteSummary['topProduct'];
  let top = 0;
  for (const [productId, v] of byProductMap) {
    if (v.count > top) {
      top = v.count;
      topProduct = { productId, productName: v.productName, count: v.count };
    }
  }

  let trend: WasteSummary['trend'] = 'flat';
  if (totalCount > previousWindowCount) trend = 'up';
  else if (totalCount < previousWindowCount) trend = 'down';

  return {
    windowDays,
    totalCount,
    byCategory,
    byFoodType,
    topProduct,
    previousWindowCount,
    trend,
  };
}
