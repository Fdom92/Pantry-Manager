import { roundQuantity } from '@core/utils/formatting.util';
import type {
  ShoppingReason,
  ShoppingSuggestionGroupWithItem,
  ShoppingSuggestionWithItem,
  ShoppingSummary,
} from '@core/models/shopping';
import { ShoppingReasonEnum } from '@core/models/shopping';
import { UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';

export function determineSuggestionNeed(params: {
  totalQuantity: number;
  minThreshold: number | null;
}): { reason: ShoppingReason | null; suggestedQuantity: number } {
  const totalQuantity = params.totalQuantity;
  const minThreshold = params.minThreshold;
  if (totalQuantity <= 0) {
    return {
      reason: ShoppingReasonEnum.BASIC_OUT,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold ?? 1),
    };
  }
  if (minThreshold != null && totalQuantity < minThreshold) {
    return {
      reason: ShoppingReasonEnum.BASIC_LOW,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold - totalQuantity, minThreshold),
    };
  }
  return { reason: null, suggestedQuantity: 0 };
}

export function incrementSummary(summary: ShoppingSummary, reason: ShoppingReason): void {
  switch (reason) {
    case ShoppingReasonEnum.BELOW_MIN:
      summary.belowMin += 1;
      break;
    case ShoppingReasonEnum.BASIC_LOW:
      summary.basicLow += 1;
      break;
    case ShoppingReasonEnum.BASIC_OUT:
      summary.basicOut += 1;
      break;
    default:
      break;
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

export function groupSuggestionsBySupermarket(params: {
  suggestions: ShoppingSuggestionWithItem[];
  labelForUnassigned: string;
}): ShoppingSuggestionGroupWithItem[] {
  const map = new Map<string, ShoppingSuggestionWithItem[]>();
  for (const suggestion of params.suggestions) {
    const key = suggestion.supermarket?.toLowerCase() ?? UNASSIGNED_SUPERMARKET_KEY;
    const list = map.get(key);
    if (list) {
      list.push(suggestion);
    } else {
      map.set(key, [suggestion]);
    }
  }

  const groups = Array.from(map.entries()).map(([key, list]) => {
    const label =
      key === UNASSIGNED_SUPERMARKET_KEY ? params.labelForUnassigned : list[0]?.supermarket ?? params.labelForUnassigned;
    return { key, label, suggestions: list };
  });

  return groups.sort((a, b) => {
    if (a.key === UNASSIGNED_SUPERMARKET_KEY) {
      return 1;
    }
    if (b.key === UNASSIGNED_SUPERMARKET_KEY) {
      return -1;
    }
    return a.label.localeCompare(b.label);
  });
}

