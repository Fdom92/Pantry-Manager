import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';
import type { FoodClass } from './food-classes.model';
import { genericClassFor } from './food-classes.data';

/**
 * The 5.7 per-type shelf lives. Only learned-shelf-life reads it, to skip old ADD
 * events whose date was the app's own suggestion (they carry no dateFromUser).
 */
export const LEGACY_SHELF_LIFE_DAYS: Readonly<Record<FoodType, number | null>> = {
  [FoodType.PROTEIN]: 5,
  [FoodType.VEGETABLE]: 7,
  [FoodType.FRUIT]: 7,
  [FoodType.DAIRY]: 14,
  [FoodType.CARB]: 270,
  [FoodType.NON_PERISHABLE]: 540,
  [FoodType.BEVERAGE]: 180,
  [FoodType.OTHER]: 120,
  [FoodType.HOUSEHOLD]: null,
};

/** Whether a date means anything for this food type at all. */
export function foodTypeExpires(foodType: FoodType): boolean {
  return genericClassFor(foodType).sealedDays !== null;
}

/**
 * Suggests a `YYYY-MM-DD` expiry date by adding the class's sealed days to
 * fromDate, or undefined for a class that never expires — callers mark those
 * `noExpiry` instead of inventing a date.
 */
export function suggestExpiryDate(klass: FoodClass, fromDate: Date): string | undefined {
  if (klass.sealedDays === null) return undefined;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + klass.sealedDays);
  return toLocalYmd(result);
}
