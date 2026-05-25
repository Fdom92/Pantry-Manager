import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';
import { getItemStatusState, isIncomplete, sumQuantities } from '@core/domain/pantry';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

export interface InventorySnapshot {
  total: number;
  active: number;
  expired: number;
  review: number;
  nearExpiry: number;
  lowStock: number;
  basicsOutOfStock: number;
  noExpiryDate: number;
  pendientes: number;
  expiredRatio: number;
}

export interface ActivityMetrics {
  added: number;
  consumed: number;
  expired: number;
  wasteRatio: number | null;
  rotationRatio: 'high' | 'medium' | 'low' | null;
  windowDays: number;
}

const FOOD_TYPE_DISPLAY_ORDER: FoodType[] = [
  FoodType.PROTEIN,
  FoodType.VEGETABLE,
  FoodType.FRUIT,
  FoodType.DAIRY,
  FoodType.CARB,
  FoodType.OTHER,
];

export interface DistributionMetrics {
  foodTypes: { foodType: FoodType; count: number }[];
  mostWastedFoodType: FoodType | null;
  leastRotatingFoodType: FoodType | null;
}

export function computeInventorySnapshot(items: PantryItem[], now: Date): InventorySnapshot {
  const result: InventorySnapshot = {
    total: items.length,
    active: 0,
    expired: 0,
    review: 0,
    nearExpiry: 0,
    lowStock: 0,
    basicsOutOfStock: 0,
    noExpiryDate: 0,
    pendientes: 0,
    expiredRatio: 0,
  };

  for (const item of items) {
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

    if (state === 'expired') {
      result.expired += 1;
    } else {
      result.active += 1;
      if (state === 'review') result.review += 1;
      else if (state === 'near-expiry') result.nearExpiry += 1;
      else if (state === 'low-stock') result.lowStock += 1;
    }

    if (item.isBasic === true && sumQuantities(item.batches ?? []) === 0) {
      result.basicsOutOfStock += 1;
    }

    if (item.productType !== 'fresh') {
      const hasBatchDate = (item.batches ?? []).some(b => !!b.expirationDate);
      const allMarkedNoExpiry =
        (item.batches ?? []).length > 0 &&
        (item.batches ?? []).every(b => !!b.noExpiry);
      if (!hasBatchDate && !allMarkedNoExpiry) {
        result.noExpiryDate += 1;
      }
    }

    if (isIncomplete(item)) {
      result.pendientes += 1;
    }
  }

  result.expiredRatio = result.total > 0 ? result.expired / result.total : 0;
  return result;
}

export function computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date,
  activeInventory: number,
): ActivityMetrics {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  let added = 0;
  let consumed = 0;
  let expired = 0;

  for (const e of recent) {
    if (e.eventType === 'ADD') added += 1;
    else if (e.eventType === 'CONSUME') consumed += 1;
    else if (e.eventType === 'EXPIRE') expired += 1;
  }

  const wasteRatio =
    expired + consumed === 0 ? null : expired / (expired + consumed);

  let rotationRatio: 'high' | 'medium' | 'low' | null = null;
  if (activeInventory > 0) {
    const ratio = consumed / activeInventory;
    if (ratio >= 0.3) rotationRatio = 'high';
    else if (ratio >= 0.1) rotationRatio = 'medium';
    else rotationRatio = 'low';
  }

  return { added, consumed, expired, wasteRatio, rotationRatio, windowDays };
}

export function computeDistribution(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number,
): DistributionMetrics {
  const foodTypeCounts = new Map<FoodType, number>();
  for (const item of items) {
    if (item.productType === 'fresh') continue;
    if (!item.foodType || item.foodType === FoodType.HOUSEHOLD) continue;
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (state === 'expired') continue;
    foodTypeCounts.set(item.foodType, (foodTypeCounts.get(item.foodType) ?? 0) + 1);
  }

  // Fixed display order — "Otros" never first
  const foodTypes = FOOD_TYPE_DISPLAY_ORDER
    .filter(ft => foodTypeCounts.has(ft))
    .map(ft => ({ foodType: ft, count: foodTypeCounts.get(ft)! }));

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  const expiredFoodTypeCounts = new Map<FoodType, number>();
  const consumedByType = new Map<FoodType, number>();

  for (const e of recent) {
    if (!e.foodType || e.foodType === FoodType.HOUSEHOLD) continue;
    if (e.eventType === 'EXPIRE') {
      expiredFoodTypeCounts.set(
        e.foodType as FoodType,
        (expiredFoodTypeCounts.get(e.foodType as FoodType) ?? 0) + 1,
      );
    } else if (e.eventType === 'CONSUME') {
      consumedByType.set(
        e.foodType as FoodType,
        (consumedByType.get(e.foodType as FoodType) ?? 0) + 1,
      );
    }
  }

  const mostWastedFoodType =
    expiredFoodTypeCounts.size === 0
      ? null
      : Array.from(expiredFoodTypeCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

  let leastRotatingFoodType: FoodType | null = null;
  let lowestRatio = Infinity;
  for (const [ft, count] of foodTypeCounts.entries()) {
    if (count < 2) continue;
    const consumed = consumedByType.get(ft) ?? 0;
    const ratio = consumed / count;
    if (ratio < lowestRatio) {
      lowestRatio = ratio;
      leastRotatingFoodType = ft;
    }
  }

  return { foodTypes, mostWastedFoodType, leastRotatingFoodType };
}

// ─── Pantry Score ─────────────────────────────────────────────────────────────

export type PantryScoreLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface PantryScoreResult {
  score: number;
  label: PantryScoreLabel;
}

/**
 * Computes a 0–100 pantry health score.
 * Returns null when fewer than 3 items (not enough signal).
 */
export function computePantryScore(
  total: number,
  expired: number,
  nearExpiry: number,
  noDateCount: number,
  lowStock: number,
  stale: number,
): PantryScoreResult | null {
  if (total < 3) return null;

  let score = 100;

  if (expired > 0) {
    score -= Math.min(40, 15 + (expired / total) * 30);
  }
  if (nearExpiry > 0) {
    score -= Math.min(20, 8 + (nearExpiry / total) * 15);
  }

  score -= (noDateCount / total) * 15;
  score -= (lowStock / total) * 10;
  score -= (stale / total) * 5;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let label: PantryScoreLabel;
  if (score >= 85) label = 'excellent';
  else if (score >= 65) label = 'good';
  else if (score >= 40) label = 'fair';
  else label = 'poor';

  return { score, label };
}

// ─── Food Coverage ────────────────────────────────────────────────────────────

export type FoodCoverageUnit = 'days' | 'months' | 'years';

export interface FoodCoverageResult {
  value: number;
  unit: FoodCoverageUnit;
  enhanced: boolean;
}

const FOOD_TYPE_WEIGHTS: Record<FoodType, number> = {
  [FoodType.PROTEIN]:   1.2,
  [FoodType.CARB]:      1.1,
  [FoodType.VEGETABLE]: 0.9,
  [FoodType.FRUIT]:     0.6,
  [FoodType.DAIRY]:     0.6,
  [FoodType.OTHER]:     0.4,
  [FoodType.HOUSEHOLD]: 0,
};

const FOOD_TYPE_COVERAGE_THRESHOLD = 0.5;

/**
 * Estimates food coverage in days/months/years based on active item quantities.
 * Assumes 3 meal portions per day. Returns null when fewer than 3 items.
 */
export function computeFoodCoverage(activeItems: PantryItem[]): FoodCoverageResult | null {
  if (activeItems.length < 3) return null;

  const classifiedCount = activeItems.filter(i => i.foodType).length;
  const enhanced = classifiedCount / activeItems.length >= FOOD_TYPE_COVERAGE_THRESHOLD;

  const totalPortions = activeItems.reduce((sum, item) => {
    const quantity = (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);
    const weight = enhanced && item.foodType ? FOOD_TYPE_WEIGHTS[item.foodType] : 1.0;
    return sum + quantity * weight;
  }, 0);

  if (totalPortions === 0) return null;

  const days = Math.max(1, Math.floor(totalPortions / 3));

  if (days >= 365) return { value: Math.max(1, Math.round(days / 365)), unit: 'years', enhanced };
  if (days >= 30)  return { value: Math.max(1, Math.round(days / 30)),  unit: 'months', enhanced };
  return { value: days, unit: 'days', enhanced };
}

// ─── Pantry Health State ──────────────────────────────────────────────────────

export enum PantryHealthState {
  CRITICAL  = 'critical',
  ATTENTION = 'attention',
  OPTIMAL   = 'optimal',
}

/**
 * Derives pantry health state from expiry/tracking signals.
 * withDates = count of non-basic items that have at least one dated batch.
 */
export function computePantryHealthState(
  expired: number,
  nearExpiry: number,
  total: number,
  withDates: number,
  stale: number,
): PantryHealthState {
  if (expired > 0) return PantryHealthState.CRITICAL;
  if (nearExpiry > 0) return PantryHealthState.ATTENTION;
  if (total > 10 && withDates < total * 0.3) return PantryHealthState.ATTENTION;
  return PantryHealthState.OPTIMAL;
}
