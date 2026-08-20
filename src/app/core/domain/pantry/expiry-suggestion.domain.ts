import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';

/**
 * Estimated shelf life in days per FoodType, used to pre-fill a suggested
 * expiry date in the pendientes bulk-fix sheet once the user picks a type.
 * Orientative values — tune independently of the rest of this module.
 */
export const EXPIRY_SUGGESTION_DAYS: Record<FoodType, number> = {
  [FoodType.PROTEIN]: 5,
  [FoodType.CARB]: 270,
  [FoodType.VEGETABLE]: 7,
  [FoodType.FRUIT]: 7,
  [FoodType.DAIRY]: 14,
  [FoodType.BEVERAGE]: 180,
  [FoodType.NON_PERISHABLE]: 540,
  [FoodType.HOUSEHOLD]: 365,
  [FoodType.OTHER]: 120,
};

/**
 * Suggests a `YYYY-MM-DD` expiry date by adding the foodType's estimated
 * shelf life to fromDate (defaults to now).
 */
export function suggestExpiryDate(foodType: FoodType, fromDate: Date = new Date()): string {
  const days = EXPIRY_SUGGESTION_DAYS[foodType];
  const result = new Date(fromDate);
  result.setDate(result.getDate() + days);
  return toLocalYmd(result);
}
