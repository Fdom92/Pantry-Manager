import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';
import { FOOD_TYPE_PROFILE, foodTypeExpires } from './food-type-profile.domain';

export { foodTypeExpires };

/**
 * Shelf life per FoodType, derived from FOOD_TYPE_PROFILE — null where a date
 * would be a fiction. Kept as a named export because it reads better at the
 * call sites that only care about the number.
 */
export const EXPIRY_SUGGESTION_DAYS: Record<FoodType, number | null> =
  Object.fromEntries(
    (Object.entries(FOOD_TYPE_PROFILE) as [FoodType, { shelfLifeDays: number | null }][])
      .map(([type, profile]) => [type, profile.shelfLifeDays]),
  ) as Record<FoodType, number | null>;

/**
 * Suggests a `YYYY-MM-DD` expiry date by adding the foodType's shelf life to
 * fromDate, or undefined for a type that never expires — callers mark those
 * `noExpiry` instead of inventing a date.
 */
export function suggestExpiryDate(
  foodType: FoodType,
  fromDate: Date = new Date(),
): string | undefined {
  const days = FOOD_TYPE_PROFILE[foodType].shelfLifeDays;
  if (days === null) return undefined;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + days);
  return toLocalYmd(result);
}
