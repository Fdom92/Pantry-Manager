import { roundQuantity } from '@core/utils/formatting.util';
import { ShoppingReason, type ShoppingSummary, type ShoppingSuggestionWithItem } from '@core/models/list';

export const URGENCY_WEIGHT: Record<ShoppingReason, number> = {
  [ShoppingReason.FRESH_EMPTY]: 1,
  [ShoppingReason.FRESH_LOW]:   1.5,
  [ShoppingReason.EMPTY]:       2,
  [ShoppingReason.BELOW_MIN]:   3,
  [ShoppingReason.MANUAL]:      4,
};

/**
 * Determine whether an item needs restocking and what reason to assign.
 *
 * For fresh items the caller is responsible for only passing items where
 * shouldAutoAddToShoppingList() returned true — i.e. items that are actually
 * below their configured threshold. This function does not re-check that gate
 * for fresh items because fresh threshold logic lives in pantry-status.domain.
 */
export function determineSuggestionNeed(params: {
  totalQuantity: number;
  minThreshold: number | null;
  isFresh?: boolean;
}): { reason: ShoppingReason | null; suggestedQuantity: number } {
  const { totalQuantity, minThreshold, isFresh } = params;

  if (totalQuantity <= 0) {
    const reason = isFresh ? ShoppingReason.FRESH_EMPTY : ShoppingReason.EMPTY;
    return { reason, suggestedQuantity: isFresh ? 0 : ensureMinimumSuggestedQuantity(minThreshold ?? 1) };
  }

  if (isFresh) {
    // qty > 0 but below the fresh keep-in-stock threshold (caller already verified this)
    return { reason: ShoppingReason.FRESH_LOW, suggestedQuantity: 0 };
  }

  if (minThreshold != null && totalQuantity < minThreshold) {
    return {
      reason: ShoppingReason.BELOW_MIN,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold - totalQuantity, minThreshold),
    };
  }

  return { reason: null, suggestedQuantity: 0 };
}

export function sortSuggestionsByUrgency(
  suggestions: ShoppingSuggestionWithItem[]
): ShoppingSuggestionWithItem[] {
  return [...suggestions].sort(
    (a, b) => (URGENCY_WEIGHT[a.reason] ?? 99) - (URGENCY_WEIGHT[b.reason] ?? 99)
  );
}

export function incrementSummary(summary: ShoppingSummary, reason: ShoppingReason): ShoppingSummary {
  switch (reason) {
    case ShoppingReason.BELOW_MIN:
      return { ...summary, belowMin: summary.belowMin + 1 };
    case ShoppingReason.EMPTY:
    case ShoppingReason.FRESH_EMPTY:
      return { ...summary, empty: summary.empty + 1 };
    case ShoppingReason.FRESH_LOW:
      return { ...summary, belowMin: summary.belowMin + 1 };
    default:
      return summary;
  }
}

export function ensureMinimumSuggestedQuantity(value: number, fallback?: number): number {
  const rounded = roundQuantity(value);
  if (rounded > 0) {
    return rounded;
  }
  if (fallback != null && fallback > 0) {
    return roundQuantity(fallback);
  }
  return 1;
}
