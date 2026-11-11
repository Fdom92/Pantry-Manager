import type { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';
import { foodTypeExpires, suggestExpiryDate } from './expiry-suggestion.domain';
import { resolveFoodClass } from './food-class-resolution.domain';

/**
 * Guesses the FoodType of a product from the name the user typed, through the
 * food class table (whole words, longest term wins).
 *
 * Returns null when nothing matches: callers must treat that as "unknown"
 * and fall back to their existing no-date behaviour.
 */
export function inferFoodType(name: string): FoodType | null {
  return resolveFoodClass(name)?.foodType ?? null;
}

export interface InferredExpiry {
  foodType: FoodType | null;
  /** `YYYY-MM-DD`, or undefined when the name could not be recognised. */
  expirationDate: string | undefined;
  /** True when the recognised type never expires, so no date should be invented. */
  noExpiry?: boolean;
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
    expirationDate: foodType ? suggestExpiryDate(foodType, fromDate) : undefined,
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
  learnedDays?: number,
): SuggestedExpiry {
  const type = foodType ?? inferFoodType(name);
  if (type && !foodTypeExpires(type)) return { noExpiry: true };
  // This household's own history for the product beats any table.
  if (learnedDays && learnedDays > 0) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + learnedDays);
    return { expirationDate: toLocalYmd(date) };
  }
  if (!type) return {};
  return { expirationDate: suggestExpiryDate(type, fromDate) };
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
