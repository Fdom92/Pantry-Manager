import { FoodType } from '@core/models/shared/enums.model';
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

export type PantryScoreLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface PantryScoreResult {
  score: number;
  label: PantryScoreLabel;
}

/**
 * Computes a 0–100 pantry management health score based on expiry tracking, stock levels and activity.
 * Returns null when there is not enough data (fewer than 3 items).
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

  // Expired items: strong penalty — at least 15pts, scales up with ratio
  if (expired > 0) {
    score -= Math.min(40, 15 + (expired / total) * 30);
  }

  // Near-expiry: moderate penalty — at least 8pts, scales up with ratio
  if (nearExpiry > 0) {
    score -= Math.min(20, 8 + (nearExpiry / total) * 15);
  }

  // Items without dates: soft penalty proportional to ratio
  score -= (noDateCount / total) * 15;

  // Low stock: soft penalty
  score -= (lowStock / total) * 10;

  // Stale items: very soft penalty
  score -= (stale / total) * 5;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let label: PantryScoreLabel;
  if (score >= 85) label = 'excellent';
  else if (score >= 65) label = 'good';
  else if (score >= 40) label = 'fair';
  else label = 'poor';

  return { score, label };
}

export type FoodCoverageUnit = 'days' | 'months' | 'years';

export interface FoodCoverageResult {
  value: number;
  unit: FoodCoverageUnit;
  enhanced: boolean;
}

// How much a single unit of each food type contributes to daily portions.
// Proteins/dairy/fruit: ~1 serving per meal-occasion.
// Carbs: base of most meals, slightly higher frequency.
// Vegetables: side dish at most meals, highest frequency.
// Other (condiments, sauces): contributes less directly to meal coverage.
const FOOD_TYPE_WEIGHTS: Record<FoodType, number> = {
  [FoodType.PROTEIN]: 1.2,
  [FoodType.CARB]: 1.1,
  [FoodType.VEGETABLE]: 0.9,
  [FoodType.FRUIT]: 0.6,
  [FoodType.DAIRY]: 0.6,
  [FoodType.OTHER]: 0.4,
};

// Minimum ratio of items with foodType assigned to use enhanced calculation.
const FOOD_TYPE_THRESHOLD = 0.5;

/**
 * Estimates food coverage based on total batch quantity of active (non-expired) items.
 * Assumes 3 meal portions consumed per day.
 * When ≥50% of items have foodType set, uses per-type weighted portions for a more
 * accurate estimate. Otherwise falls back to the simple flat calculation.
 * Returns null when there is not enough data.
 * Automatically scales the unit: days → months (≥30d) → years (≥365d).
 */
export function computeFoodCoverage(activeItems: PantryItem[]): FoodCoverageResult | null {
  if (activeItems.length < 3) return null;

  const classifiedCount = activeItems.filter(i => i.foodType).length;
  const enhanced = classifiedCount / activeItems.length >= FOOD_TYPE_THRESHOLD;

  const totalPortions = activeItems.reduce((sum, item) => {
    const quantity = (item.batches ?? []).reduce((bSum, b) => bSum + (b.quantity ?? 0), 0);
    const weight = enhanced && item.foodType ? FOOD_TYPE_WEIGHTS[item.foodType] : 1.0;
    return sum + quantity * weight;
  }, 0);

  if (totalPortions === 0) return null;

  const days = Math.max(1, Math.floor(totalPortions / 3));

  if (days >= 365) {
    return { value: Math.max(1, Math.round(days / 365)), unit: 'years', enhanced };
  }
  if (days >= 30) {
    return { value: Math.max(1, Math.round(days / 30)), unit: 'months', enhanced };
  }
  return { value: days, unit: 'days', enhanced };
}
