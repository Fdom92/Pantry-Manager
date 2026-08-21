import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';

/**
 * Estimated shelf life in days per FoodType, or NEVER_EXPIRES for the types
 * where a date would be a fiction. Orientative values — tune independently of
 * the rest of this module.
 *
 * Bin bags do not go off, and neither does salt. Both were given a date here
 * once — 365 and 540 days — while `getExpiryModeFromFoodType` returned 'ignore'
 * for them, so the app printed a number on screen it had already decided never
 * to act on. Onboarding disagreed too: it seeds salt and sugar as no-expiry.
 * Saying NEVER_EXPIRES keeps the one table honest and the two paths in step.
 */
export const NEVER_EXPIRES = 'none' as const;

export const EXPIRY_SUGGESTION_DAYS: Record<FoodType, number | typeof NEVER_EXPIRES> = {
  [FoodType.PROTEIN]: 5,
  [FoodType.CARB]: 270,
  [FoodType.VEGETABLE]: 7,
  [FoodType.FRUIT]: 7,
  [FoodType.DAIRY]: 14,
  [FoodType.BEVERAGE]: 180,
  [FoodType.NON_PERISHABLE]: NEVER_EXPIRES,
  [FoodType.HOUSEHOLD]: NEVER_EXPIRES,
  [FoodType.OTHER]: 120,
};

/** Whether a date means anything for this food type at all. */
export function foodTypeExpires(foodType: FoodType): boolean {
  return EXPIRY_SUGGESTION_DAYS[foodType] !== NEVER_EXPIRES;
}

/**
 * Suggests a `YYYY-MM-DD` expiry date by adding the foodType's estimated shelf
 * life to fromDate (defaults to now), or undefined for a type that never
 * expires — callers mark those `noExpiry` instead of inventing a date.
 */
export function suggestExpiryDate(
  foodType: FoodType,
  fromDate: Date = new Date(),
): string | undefined {
  const days = EXPIRY_SUGGESTION_DAYS[foodType];
  if (days === NEVER_EXPIRES) return undefined;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + days);
  return toLocalYmd(result);
}
