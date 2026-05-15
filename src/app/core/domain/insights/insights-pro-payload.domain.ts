import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';
import { getItemStatusState, sumQuantities } from '@core/domain/pantry';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

export interface InsightsInventorySignals {
  totalProducts: number;
  expiredCount: number;
  nearExpiryCount: number;
  reviewCount: number;
  lowStockCount: number;
  wasteRatio: number | null;
  noExpiryRatio: number;
}

export interface InsightsActivitySignals {
  addedCount: number;
  consumedCount: number;
  expiredCount: number;
  wasteRatio: number | null;
  inventoryDelta: 'growing' | 'stable' | 'shrinking';
}

export interface InsightsPatternSignals {
  mostWastefulFoodType: string | null;
  mostConsumedFoodType: string | null;
  leastRotatingFoodType: string | null;
  overrepresentedCategory: string | null;
  underusedCategory: string | null;
}

export interface InsightsCategoryBreakdown {
  foodType: string;
  count: number;
  expiredRatio: number;
}

export interface InsightsProductSignals {
  nearExpiryProducts: string[];
  recentlyExpiredProducts: string[];
  staleProducts: string[];
}

export interface InsightsDerivedFeatures {
  inventoryTrend: 'up' | 'down' | 'stable';
  wasteTrend: 'improving' | 'worsening' | 'stable';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface InsightsSignalsPayload {
  locale: string;
  signals: InsightsInventorySignals;
  inventory: InsightsCategoryBreakdown[];
  activity: InsightsActivitySignals;
  patterns: InsightsPatternSignals;
  products: InsightsProductSignals;
  derived: InsightsDerivedFeatures;
}

export function computeInventorySignals(items: PantryItem[], now: Date): InsightsInventorySignals {
  let expiredCount = 0;
  let nearExpiryCount = 0;
  let reviewCount = 0;
  let lowStockCount = 0;
  let noExpiryDateCount = 0;

  for (const item of items) {
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

    if (state === 'expired') {
      expiredCount += 1;
    } else {
      if (state === 'near-expiry') nearExpiryCount += 1;
      else if (state === 'review') reviewCount += 1;
      else if (state === 'low-stock') lowStockCount += 1;
    }

    if (item.productType !== 'fresh') {
      const hasBatchDate = (item.batches ?? []).some(b => !!b.expirationDate);
      const allMarkedNoExpiry =
        (item.batches ?? []).length > 0 && (item.batches ?? []).every(b => !!b.noExpiry);
      if (!hasBatchDate && !allMarkedNoExpiry) noExpiryDateCount += 1;
    }
  }

  const total = items.length;
  return {
    totalProducts: total,
    expiredCount,
    nearExpiryCount,
    reviewCount,
    lowStockCount,
    wasteRatio: total > 0 ? expiredCount / total : null,
    noExpiryRatio: total > 0 ? noExpiryDateCount / total : 0,
  };
}

export function computeActivitySignals(
  events: PantryEvent[],
  windowDays: number,
  now: Date
): InsightsActivitySignals {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  let addedCount = 0;
  let consumedCount = 0;
  let expiredCount = 0;

  for (const e of recent) {
    if (e.eventType === 'ADD') addedCount += 1;
    else if (e.eventType === 'CONSUME') consumedCount += 1;
    else if (e.eventType === 'EXPIRE') expiredCount += 1;
  }

  const wasteRatio =
    expiredCount + consumedCount === 0 ? null : expiredCount / (expiredCount + consumedCount);

  const outflow = consumedCount + expiredCount;
  const inventoryDelta: 'growing' | 'stable' | 'shrinking' =
    outflow === 0
      ? addedCount > 0
        ? 'growing'
        : 'stable'
      : addedCount > outflow * 1.2
        ? 'growing'
        : addedCount < outflow * 0.8
          ? 'shrinking'
          : 'stable';

  return { addedCount, consumedCount, expiredCount, wasteRatio, inventoryDelta };
}

export function computePatternSignals(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number
): InsightsPatternSignals {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  const expiredByType = new Map<string, number>();
  const consumedByType = new Map<string, number>();
  const addedByType = new Map<string, number>();

  for (const e of recent) {
    if (!e.foodType || e.foodType === FoodType.HOUSEHOLD) continue;
    if (e.eventType === 'EXPIRE')
      expiredByType.set(e.foodType, (expiredByType.get(e.foodType) ?? 0) + 1);
    else if (e.eventType === 'CONSUME')
      consumedByType.set(e.foodType, (consumedByType.get(e.foodType) ?? 0) + 1);
    else if (e.eventType === 'ADD')
      addedByType.set(e.foodType, (addedByType.get(e.foodType) ?? 0) + 1);
  }

  const mostWastefulFoodType =
    expiredByType.size === 0
      ? null
      : Array.from(expiredByType.entries()).sort((a, b) => b[1] - a[1])[0][0];

  const mostConsumedFoodType =
    consumedByType.size === 0
      ? null
      : Array.from(consumedByType.entries()).sort((a, b) => b[1] - a[1])[0][0];

  const inventoryByType = new Map<string, number>();
  for (const item of items) {
    if (!item.foodType || item.foodType === FoodType.HOUSEHOLD) continue;
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (state === 'expired') continue;
    inventoryByType.set(item.foodType, (inventoryByType.get(item.foodType) ?? 0) + 1);
  }

  let leastRotatingFoodType: string | null = null;
  let lowestRotationRatio = Infinity;
  for (const [ft, count] of inventoryByType.entries()) {
    if (count < 2) continue;
    const activity = (consumedByType.get(ft) ?? 0) + (addedByType.get(ft) ?? 0);
    const ratio = activity / count;
    if (ratio < lowestRotationRatio) {
      lowestRotationRatio = ratio;
      leastRotatingFoodType = ft;
    }
  }

  const activeTotal = Array.from(inventoryByType.values()).reduce((s, n) => s + n, 0);
  let overrepresentedCategory: string | null = null;
  let overrepresentedCount = 0;
  for (const [ft, count] of inventoryByType.entries()) {
    if (activeTotal > 0 && count / activeTotal > 0.25 && count > overrepresentedCount) {
      overrepresentedCategory = ft;
      overrepresentedCount = count;
    }
  }

  let underusedCategory: string | null = null;
  let maxUnderusedCount = 1;
  for (const [ft, count] of inventoryByType.entries()) {
    if ((consumedByType.get(ft) ?? 0) === 0 && count > maxUnderusedCount) {
      maxUnderusedCount = count;
      underusedCategory = ft;
    }
  }

  return {
    mostWastefulFoodType,
    mostConsumedFoodType,
    leastRotatingFoodType,
    overrepresentedCategory,
    underusedCategory,
  };
}

export function computeCategoryBreakdown(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number
): InsightsCategoryBreakdown[] {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  const countByType = new Map<string, number>();
  for (const item of items) {
    if (!item.foodType || item.foodType === FoodType.HOUSEHOLD) continue;
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (state === 'expired') continue;
    countByType.set(item.foodType, (countByType.get(item.foodType) ?? 0) + 1);
  }

  const expiredByType = new Map<string, number>();
  const consumedByType = new Map<string, number>();
  for (const e of recent) {
    if (!e.foodType || e.foodType === FoodType.HOUSEHOLD) continue;
    if (e.eventType === 'EXPIRE')
      expiredByType.set(e.foodType, (expiredByType.get(e.foodType) ?? 0) + 1);
    else if (e.eventType === 'CONSUME')
      consumedByType.set(e.foodType, (consumedByType.get(e.foodType) ?? 0) + 1);
  }

  return Array.from(countByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([foodType, count]) => {
      const expired = expiredByType.get(foodType) ?? 0;
      const consumed = consumedByType.get(foodType) ?? 0;
      const expiredRatio = expired + consumed === 0 ? 0 : expired / (expired + consumed);
      return { foodType, count, expiredRatio };
    });
}

export function computeProductSignals(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number
): InsightsProductSignals {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recentCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const nearExpiryProducts = items
    .filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'near-expiry')
    .slice(0, 5)
    .map(item => item.name);

  const seenExpired = new Set<string>();
  const recentlyExpiredProducts: string[] = [];
  for (const e of events) {
    if (
      e.eventType === 'EXPIRE' &&
      new Date(e.timestamp).getTime() >= recentCutoff &&
      e.productName &&
      !seenExpired.has(e.productName)
    ) {
      seenExpired.add(e.productName);
      recentlyExpiredProducts.push(e.productName);
      if (recentlyExpiredProducts.length >= 5) break;
    }
  }

  const activeItemNames = new Set(
    items
      .filter(item => {
        const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
        return state !== 'expired' && sumQuantities(item.batches ?? []) > 0;
      })
      .map(item => item.name)
  );

  const recentlyActiveNames = new Set(
    events
      .filter(e => new Date(e.timestamp).getTime() >= cutoff && e.productName)
      .map(e => e.productName!)
  );

  const staleProducts = Array.from(activeItemNames)
    .filter(name => !recentlyActiveNames.has(name))
    .slice(0, 5);

  return { nearExpiryProducts, recentlyExpiredProducts, staleProducts };
}

export function computeDerivedFeatures(
  inventory: InsightsInventorySignals,
  activity: InsightsActivitySignals
): InsightsDerivedFeatures {
  const inventoryTrend: 'up' | 'down' | 'stable' =
    activity.inventoryDelta === 'growing'
      ? 'up'
      : activity.inventoryDelta === 'shrinking'
        ? 'down'
        : 'stable';

  const wasteTrend: 'improving' | 'worsening' | 'stable' =
    activity.wasteRatio === null
      ? 'stable'
      : activity.wasteRatio > 0.3
        ? 'worsening'
        : activity.wasteRatio < 0.1
          ? 'improving'
          : 'stable';

  const riskScore =
    (inventory.expiredCount + inventory.nearExpiryCount) / Math.max(inventory.totalProducts, 1);
  const riskLevel: 'low' | 'medium' | 'high' =
    riskScore > 0.3 ? 'high' : riskScore > 0.1 ? 'medium' : 'low';

  return { inventoryTrend, wasteTrend, riskLevel };
}
