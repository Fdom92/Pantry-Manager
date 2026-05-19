import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { getItemStatusState } from '@core/domain/pantry/pantry-status.domain';
import { calculateUrgencyScore } from '@core/domain/pantry/urgency.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

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

// Factor de confianza para fechas de frescos (estimativas, no impresas en envase).
export const FRESH_URGENCY_FACTOR = 0.7;

// Bonus de score cuando un fresco está agotado y el usuario lo marcó keep-in-stock.
// Es la única regla especial que tienen los frescos en el bloque HOY.
export const FRESH_OUT_BONUS = 80;


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
  const now = new Date(nowMs);

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
    const isFresh = item.productType === 'fresh';

    const state = getState(item);
    let urgency = calculateUrgencyScore(state, days).score;

    if (state !== 'review') {
      if (isLowStock)         urgency += 25;
      if (isFastMoving(type)) urgency += 10;
      if (isFresh)            urgency *= FRESH_URGENCY_FACTOR;
    }

    let total = urgency + (HOY_FOOD_TYPE_SCORE[type] ?? 0);

    // Excepción: fresco agotado con isBasic activo es señal genuina (te falta algo importante).
    const isFreshOut = isFresh && stock === 0 && item.isBasic === true;
    if (isFreshOut) total += FRESH_OUT_BONUS;

    return total;
  };

  // Items without an expiry date are excluded — this block is about urgency, not general stock.
  const hasDatedBatch = (item: PantryItem): boolean => !!getEarliestExpiryDate(item);

  const getState = (item: PantryItem) => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

  // Expired items belong to "Qué hacer ahora". Review items (flexible grace) ARE shown here.
  const isNotExpired = (item: PantryItem): boolean => getState(item) !== 'expired';

  // isBasic encodes "keep in stock" for fresh items.
  // Fresh item with zero stock but isBasic active: a genuine "buy this today" signal.
  const isFreshOutCandidate = (item: PantryItem): boolean =>
    item.productType === 'fresh'
    && getStock(item) === 0
    && item.isBasic === true;

  const foodItems = allItems.filter(i => isFood(i) && (
    isFreshOutCandidate(i) || (hasStock(i) && hasDatedBatch(i) && isNotExpired(i))
  ));
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

  const freshOutPool = allItems.filter(isFreshOutCandidate);
  const reviewPool = allItems.filter(i =>
    isFood(i) && hasStock(i) && hasDatedBatch(i) && getState(i) === 'review'
  );

  const candidatePool = [...new Map(
    [...nearExpiryItems, ...freshOutPool, ...reviewPool].map(i => [i._id, i]),
  ).values()];

  // Pool: near-expiry items plus fresh items in Nada+keepInStock (without dated batch).
  const nearCandidates = candidatePool
    .filter(i => isFood(i))
    .filter(i => isFreshOutCandidate(i) || (hasStock(i) && hasDatedBatch(i) && isNotExpired(i)))
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
  const isFreshProtagonist = protagonist.productType === 'fresh';
  const protagonistStock = getStock(protagonist);
  const protagonistKeepInStock = protagonist.isBasic === true;

  let reasonKey: string;
  if (isFreshProtagonist && protagonistStock === 0 && protagonistKeepInStock) {
    reasonKey = 'dashboard.today.reason.freshOut';
  } else if (isFreshProtagonist) {
    reasonKey = 'dashboard.today.reason.freshExpiring';
  } else if (getState(protagonist) === 'review') {
    reasonKey = 'dashboard.today.reason.reviewExpiry';
  } else if (protagonistDays !== null && protagonistDays <= 2) {
    reasonKey = 'dashboard.today.reason.expiringsoon';
  } else if (protagonistDays !== null && protagonistDays <= 5) {
    reasonKey = 'dashboard.today.reason.expirestoday';
  } else {
    reasonKey = 'dashboard.today.reason.expiringlater';
  }

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
