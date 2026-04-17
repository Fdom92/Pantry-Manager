import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';

// ─── Today's Suggestion ───────────────────────────────────────────────────────

// Food type score: higher = more useful as a meal protagonist.
// Dairy/snacks are not excluded — just deprioritised so proteins/carbs win when available.
const HOY_FOOD_TYPE_SCORE: Partial<Record<FoodType, number>> = {
  [FoodType.PROTEIN]:   40,
  [FoodType.CARB]:      30,
  [FoodType.VEGETABLE]: 30,
  [FoodType.FRUIT]:     15,
  [FoodType.DAIRY]:     10,
  [FoodType.OTHER]:      5,
  // HOUSEHOLD always excluded before scoring
};

// Minimum score for an item to be worth surfacing in the HOY block.
const HOY_MIN_SCORE = 30;

// Urgency score based on days until expiry.
// Expired items (≤0) are excluded before scoring — they belong to the "Qué hacer ahora" section.
const getUrgencyScore = (days: number | null): number => {
  if (days === null || days <= 0) return 0;
  if (days === 1)  return 80;
  if (days === 2)  return 75;
  if (days <= 5)   return 50;
  if (days <= 10)  return 25;
  if (days <= 15)  return 10;
  return 0;
};

// Minimum quantity threshold before an item is considered low stock, by food type.
// Higher-rotation types (dairy, fruit) deplete faster so the threshold is higher.
const getLowStockThreshold = (foodType: FoodType): number => {
  switch (foodType) {
    case FoodType.DAIRY:     return 4;
    case FoodType.FRUIT:     return 3;
    case FoodType.VEGETABLE: return 2;
    default:                 return 1; // PROTEIN, CARB, OTHER
  }
};

// Fast-moving types consume more quickly and benefit from an urgency bump.
const isFastMoving = (foodType: FoodType): boolean =>
  foodType === FoodType.DAIRY ||
  foodType === FoodType.FRUIT ||
  foodType === FoodType.VEGETABLE;

export interface TodaySuggestionItem {
  id: string;
  name: string;
  quantity: number;
  expirationDate?: string;
  daysToExpiry: number | null;
}

export interface TodaySuggestion {
  protagonist: TodaySuggestionItem;
  reasonKey: string;
  secondaryItems: TodaySuggestionItem[];
}

/**
 * Selects the single most important item the user should consume today via a
 * priority score (urgency + food-type weight), plus up to 2 secondary urgent items.
 * Proteins/carbs win over dairy/snacks when expiry urgency is similar.
 * Falls back to low-stock dated items when nothing is near expiry.
 * Returns null when there is nothing actionable above HOY_MIN_SCORE ("all good" state).
 *
 * @param skipId - ID of the item shown last session; avoided if a comparable alternative exists.
 */
export function computeTodaySuggestion(
  nearExpiryItems: PantryItem[],
  allItems: PantryItem[],
  skipId?: string,
): TodaySuggestion | null {
  const nowMs = Date.now();

  const getStock = (item: PantryItem): number =>
    (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);

  const getEarliestExpiryDate = (item: PantryItem): string | undefined =>
    (item.batches ?? [])
      .filter(b => b.expirationDate)
      .sort((a, b) => Date.parse(a.expirationDate!) - Date.parse(b.expirationDate!))[0]
      ?.expirationDate;

  const getDaysToExpiry = (item: PantryItem): number | null => {
    const date = getEarliestExpiryDate(item);
    return date ? Math.ceil((Date.parse(date) - nowMs) / 86_400_000) : null;
  };

  const isFood = (item: PantryItem): boolean =>
    item.foodType !== FoodType.HOUSEHOLD;

  const hasStock = (item: PantryItem): boolean => getStock(item) > 0;

  const toItem = (item: PantryItem): TodaySuggestionItem => ({
    id: item._id,
    name: item.name,
    quantity: getStock(item),
    expirationDate: getEarliestExpiryDate(item),
    daysToExpiry: getDaysToExpiry(item),
  });

  const scoreItem = (item: PantryItem): number => {
    const days  = getDaysToExpiry(item);
    const stock = getStock(item);
    const type  = item.foodType as FoodType;
    const isLowStock = stock <= getLowStockThreshold(type);

    let urgency = getUrgencyScore(days);
    if (isLowStock)        urgency += 25; // bonus: running out soon
    if (isFastMoving(type)) urgency += 10; // bonus: high-rotation type

    return urgency + (HOY_FOOD_TYPE_SCORE[type] ?? 0);
  };

  // Items without an expiry date are excluded — this block is about urgency, not general stock.
  const hasDatedBatch = (item: PantryItem): boolean => !!getEarliestExpiryDate(item);

  // Expired items (daysToExpiry ≤ 0) are handled by "Qué hacer ahora" and must not appear here.
  const isNotExpired = (item: PantryItem): boolean => {
    const d = getDaysToExpiry(item);
    return d === null || d > 0;
  };

  const foodItems = allItems.filter(i => isFood(i) && hasStock(i) && hasDatedBatch(i) && isNotExpired(i));
  if (!foodItems.length) return null;

  // Tiebreaker: score DESC → daysToExpiry ASC (more urgent first) → quantity DESC
  const sortCandidates = (
    a: { item: PantryItem; score: number; days: number | null },
    b: { item: PantryItem; score: number; days: number | null },
  ): number => {
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.days ?? Infinity;
    const bd = b.days ?? Infinity;
    if (ad !== bd) return ad - bd;
    return getStock(b.item) - getStock(a.item);
  };

  // Candidates: near-expiry dated non-expired items, scored by urgency + food type + bonuses
  const nearCandidates = nearExpiryItems
    .filter(i => isFood(i) && hasStock(i) && hasDatedBatch(i) && isNotExpired(i))
    .map(i => ({ item: i, score: scoreItem(i), days: getDaysToExpiry(i) }))
    .filter(({ score }) => score > 0)
    .sort(sortCandidates);

  const ranked = nearCandidates;
  if (!ranked.length) return null;

  // Minimum score guard: nothing worth surfacing → "all good" state
  if (ranked[0].score < HOY_MIN_SCORE) return null;

  // Anti-repetition: if the top scorer was shown last session and an alternative
  // with a comparable score (within 30 points) exists, prefer the alternative.
  let topIndex = 0;
  if (skipId && ranked[0].item._id === skipId && ranked.length > 1 && ranked[0].score - ranked[1].score < 30) {
    topIndex = 1;
  }

  const { item: protagonist, days: protagonistDays } = ranked[topIndex];

  // reasonKey reflects actual urgency: very soon (≤2d), soon (3-5d), or coming up (6-15d)
  const reasonKey =
    protagonistDays !== null && protagonistDays <= 2 ? 'dashboard.today.reason.expiringsoon' :
    protagonistDays !== null && protagonistDays <= 5 ? 'dashboard.today.reason.expirestoday' :
                                                       'dashboard.today.reason.expiringlater';

  // Secondary: next highest-scored near-expiry items (not the protagonist), up to 2
  const secondaryPool = nearCandidates
    .filter(({ item }) => item._id !== protagonist._id)
    .slice(0, 2)
    .map(({ item }) => toItem(item));

  return {
    protagonist: toItem(protagonist),
    reasonKey,
    secondaryItems: secondaryPool,
  };
}

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
  [FoodType.HOUSEHOLD]: 0,
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
