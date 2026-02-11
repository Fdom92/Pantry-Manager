import { roundQuantity } from '@core/utils/formatting.util';
import { ShoppingReason, type ShoppingSummary } from '@core/models/shopping';

export function determineSuggestionNeed(params: {
  totalQuantity: number;
  minThreshold: number | null;
}): { reason: ShoppingReason | null; suggestedQuantity: number } {
  const { totalQuantity, minThreshold } = params;
  if (totalQuantity <= 0) {
    return {
      reason: ShoppingReason.EMPTY,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold ?? 1),
    };
  }
  if (minThreshold != null && totalQuantity < minThreshold) {
    return {
      reason: ShoppingReason.BELOW_MIN,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold - totalQuantity, minThreshold),
    };
  }
  return { reason: null, suggestedQuantity: 0 };
}

export function incrementSummary(summary: ShoppingSummary, reason: ShoppingReason): ShoppingSummary {
  switch (reason) {
    case ShoppingReason.BELOW_MIN:
      return { ...summary, belowMin: summary.belowMin + 1 };
    case ShoppingReason.EMPTY:
      return { ...summary, empty: summary.empty + 1 };
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
