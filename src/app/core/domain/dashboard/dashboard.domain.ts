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
}

/**
 * Estimates food coverage based on total batch quantity of active (non-expired) items.
 * Assumes 3 meal portions consumed per day.
 * Returns null when there is not enough data.
 * Automatically scales the unit: days → months (≥30d) → years (≥365d).
 */
export function computeFoodCoverage(activeItems: PantryItem[]): FoodCoverageResult | null {
  if (activeItems.length < 3) return null;

  const totalUnits = activeItems.reduce((sum, item) => {
    const batchTotal = (item.batches ?? []).reduce((bSum, b) => bSum + (b.quantity ?? 0), 0);
    return sum + batchTotal;
  }, 0);

  if (totalUnits === 0) return null;

  const days = Math.max(1, Math.round(totalUnits / 3));

  if (days >= 365) {
    return { value: Math.max(1, Math.round(days / 365)), unit: 'years' };
  }
  if (days >= 30) {
    return { value: Math.max(1, Math.round(days / 30)), unit: 'months' };
  }
  return { value: days, unit: 'days' };
}
