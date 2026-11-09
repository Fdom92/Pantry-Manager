import type { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';
import { normalizeSearchQuery } from '@core/utils/normalization.util';
import { foodTypeExpires, suggestExpiryDate } from './expiry-suggestion.domain';
import { FOOD_CONCEPTS, type FoodConcept } from './food-concepts.data';

/**
 * Flattened lookup: normalised term -> concept, pooled across all languages so
 * a user typing an English word in a Spanish app still matches. Built once at
 * module load. First declaration wins on collision (see FOOD_CONCEPTS docs).
 */
const TERM_INDEX: ReadonlyMap<string, FoodConcept> = (() => {
  const index = new Map<string, FoodConcept>();
  for (const concept of FOOD_CONCEPTS) {
    for (const terms of Object.values(concept.terms)) {
      for (const term of terms) {
        const key = normalizeSearchQuery(term);
        if (key && !index.has(key)) index.set(key, concept);
      }
    }
  }
  return index;
})();

/** Longest term in the index, in words. Bounds the n-gram scan. */
const MAX_TERM_WORDS: number = (() => {
  let max = 1;
  for (const term of TERM_INDEX.keys()) {
    const words = term.split(' ').length;
    if (words > max) max = words;
  }
  return max;
})();

/**
 * Guesses the FoodType of a product from the name the user typed.
 *
 * Scans contiguous word n-grams from longest to shortest so that a specific
 * multi-word product beats a generic single word ("tomate frito" is pantry
 * sauce, "tomate" is a fresh vegetable). Matching is whole-token only, so
 * "panceta" never matches "pan".
 *
 * Returns null when nothing matches — callers must treat that as "unknown"
 * and fall back to their existing no-date behaviour.
 */
export function inferFoodType(name: string): FoodType | null {
  return inferConcept(name)?.foodType ?? null;
}

/** The catalogue concept a product name refers to, or null. */
export function inferConcept(name: string): FoodConcept | null {
  const normalized = normalizeSearchQuery(name);
  if (!normalized) return null;

  const words = normalized.split(' ').filter(Boolean);
  if (!words.length) return null;

  const maxSize = Math.min(MAX_TERM_WORDS, words.length);
  for (let size = maxSize; size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      const candidate = words.slice(start, start + size).join(' ');
      const match = TERM_INDEX.get(candidate);
      if (match) return match;
    }
  }
  return null;
}

export interface InferredExpiry {
  foodType: FoodType | null;
  /** `YYYY-MM-DD`, or undefined when the name could not be recognised. */
  expirationDate: string | undefined;
  /** True when the recognised type never expires, so no date should be invented. */
  noExpiry?: boolean;
}

/**
 * The suggested date for a product of this type, honouring a concept's own shelf
 * life only when the type is the concept's: bread typed as CARB gets days, but a
 * user who re-typed it as something else gets that type's shelf life.
 */
function suggestExpiryForName(name: string, foodType: FoodType, fromDate: Date): string | undefined {
  const concept = inferConcept(name);
  if (concept?.shelfLifeDays && concept.foodType === foodType) {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + concept.shelfLifeDays);
    return toLocalYmd(result);
  }
  return suggestExpiryDate(foodType, fromDate);
}

/**
 * Convenience wrapper: infer the food type from a product name and derive the
 * suggested expiry date from it. Returns undefined dates for unknown names so
 * every caller can keep its existing "no date" behaviour unchanged.
 */
export function inferExpiryForName(name: string, fromDate: Date): InferredExpiry {
  const foodType = inferFoodType(name);
  return {
    foodType,
    expirationDate: foodType ? suggestExpiryForName(name, foodType, fromDate) : undefined,
    noExpiry: foodType ? !foodTypeExpires(foodType) : undefined,
  };
}

/**
 * The expiry date a product should be given, from whatever is known about it.
 *
 * A stored foodType is authoritative — the user may have corrected it, and the
 * name inference must not override that. Only when there is no type do we fall
 * back to reading the name. Every add and restock flow resolves dates through
 * here so they cannot drift apart.
 */
export interface SuggestedExpiry {
  expirationDate?: string;
  /** True for a type where a date would be a fiction — bin bags, salt. */
  noExpiry?: boolean;
}

/**
 * Same suggestion, spelled the way addNewLot names its parameters. Exists so the
 * mapping lives in one place rather than being re-typed at every restock site.
 */
export function toLotExpiry(suggested: SuggestedExpiry): { expiryDate?: string; noExpiry?: boolean } {
  return { expiryDate: suggested.expirationDate, noExpiry: suggested.noExpiry };
}

export function resolveSuggestedExpiry(
  name: string,
  foodType: FoodType | null | undefined,
  fromDate: Date,
): SuggestedExpiry {
  const type = foodType ?? inferFoodType(name);
  if (!type) return {};
  if (!foodTypeExpires(type)) return { noExpiry: true };
  return { expirationDate: suggestExpiryForName(name, type, fromDate) };
}

/**
 * A row in an add sheet or the pendientes sheet, as far as expiry is concerned.
 */
export interface ExpiryEditableRow {
  expirationDate?: string;
  noExpiry?: boolean;
  /**
   * True once the user has set the date themselves. A suggested date carries no
   * such claim, so re-picking the food type is free to replace it.
   */
  dateFromUser?: boolean;
}

/**
 * The date a row should show after the user picks a food type.
 *
 * A date the user chose, or an explicit "no expiry", is theirs and survives.
 * Anything else was a suggestion derived from the previous type, so correcting
 * the type re-derives it — otherwise fixing a wrong type leaves the date it
 * produced behind, which is exactly what the sheet's own hint promises it won't.
 */
export function expiryAfterFoodTypeChange(
  row: ExpiryEditableRow,
  foodType: FoodType,
  fromDate: Date,
): SuggestedExpiry {
  if (row.dateFromUser && (row.expirationDate || row.noExpiry)) {
    return { expirationDate: row.expirationDate, noExpiry: row.noExpiry };
  }
  if (!foodTypeExpires(foodType)) return { noExpiry: true };
  return { expirationDate: suggestExpiryDate(foodType, fromDate) };
}
