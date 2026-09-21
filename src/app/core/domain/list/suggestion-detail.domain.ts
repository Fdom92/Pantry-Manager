import { ShoppingReason } from '@core/models/list';

export interface SuggestionDetail {
  key: string;
  params?: Record<string, unknown>;
}

/**
 * The secondary line under a shopping suggestion's name, or null for none.
 *
 * Fresh products never carry a threshold-based amount: their suggested
 * quantity is always 0 (the recipe decides how much to buy, not the
 * pantry), so showing it would read as "Reponer 0". They get a fixed,
 * state-based line instead.
 */
export function suggestionDetail(s: {
  reason: ShoppingReason;
  suggestedQuantity: number;
  minThreshold?: number;
}): SuggestionDetail | null {
  if (s.reason === ShoppingReason.FRESH_LOW) {
    return { key: 'shopping.suggestions.freshLow' };
  }

  if (s.reason === ShoppingReason.FRESH_EMPTY) {
    return { key: 'shopping.reasons.empty' };
  }

  if (s.minThreshold !== undefined && s.suggestedQuantity > 0) {
    return { key: 'shopping.suggestions.restock', params: { amount: s.suggestedQuantity } };
  }

  return null;
}
