import { FoodType } from '@core/models/shared/enums.model';

/**
 * Everything the domain knows about a food type, in one table.
 *
 * These facts used to live in five structures across four files — a shelf-life
 * record, an expiry-mode switch, a coverage-weight record, a chart-order record
 * and an exclusion set for the home screen's suggestion. Adding beverage and
 * non-perishable reached four of them and missed the fifth, so drinks and tinned
 * goods silently vanished from the distribution chart. Household carried a
 * 365-day shelf life while the expiry rules ignored it, so the app printed a
 * date it had already decided never to read.
 *
 * One table means a new type cannot be half-configured: it has to answer every
 * question here before the code compiles.
 */

/** How hard the expiry date is enforced once it passes. */
export type ExpiryMode = 'strict' | 'flexible' | 'ignore';

interface FoodTypeProfileBase {
  /**
   * Relative food value per unit, for estimating how many days of meals the
   * pantry holds. Zero for anything that is not a meal.
   */
  coverageWeight: number;
  /**
   * Position in the "by food type" chart, or null to leave it out — household
   * is not food, and "other" is too generic to say anything useful about.
   */
  chartRank: number | null;
  /**
   * Whether the home screen may suggest eating this today. The suggestion is
   * about rescuing food before it spoils, so drinks and store-cupboard staples
   * stay out of it even though they are food.
   */
  suggestible: boolean;
}

/**
 * A type with a real shelf life. Its expiry mode may warn softly or firmly, but
 * it may not be `ignore` — a date nothing ever reads is a date the user should
 * not have been shown.
 */
interface PerishableProfile extends FoodTypeProfileBase {
  shelfLifeDays: number;
  expiryMode: Exclude<ExpiryMode, 'ignore'>;
}

/**
 * A type with no meaningful expiry at all. It gets no date, and its mode must
 * be `ignore` — the two halves of that decision cannot be set separately.
 */
interface NonPerishableProfile extends FoodTypeProfileBase {
  shelfLifeDays: null;
  expiryMode: 'ignore';
}

export type FoodTypeProfile = PerishableProfile | NonPerishableProfile;

export const FOOD_TYPE_PROFILE: Record<FoodType, FoodTypeProfile> = {
  [FoodType.PROTEIN]: {
    shelfLifeDays: 5,
    expiryMode: 'strict',
    coverageWeight: 1.2,
    chartRank: 0,
    suggestible: true,
  },
  [FoodType.VEGETABLE]: {
    shelfLifeDays: 7,
    expiryMode: 'strict',
    coverageWeight: 0.9,
    chartRank: 1,
    suggestible: true,
  },
  [FoodType.FRUIT]: {
    shelfLifeDays: 7,
    expiryMode: 'strict',
    coverageWeight: 0.6,
    chartRank: 2,
    suggestible: true,
  },
  [FoodType.DAIRY]: {
    shelfLifeDays: 14,
    // Milk a day past its date is a judgement call, not rubbish.
    expiryMode: 'flexible',
    coverageWeight: 0.6,
    chartRank: 3,
    suggestible: true,
  },
  [FoodType.CARB]: {
    shelfLifeDays: 270,
    expiryMode: 'flexible',
    coverageWeight: 1.1,
    chartRank: 4,
    suggestible: true,
  },
  [FoodType.NON_PERISHABLE]: {
    // Oil, coffee and tins do carry a best-before, just years out.
    shelfLifeDays: 540,
    expiryMode: 'flexible',
    // Staples stretch the meals you cook without being one themselves.
    coverageWeight: 0.2,
    chartRank: 5,
    // A bag of salt is never the thing to use up today.
    suggestible: false,
  },
  [FoodType.BEVERAGE]: {
    // An opened juice goes off; a sealed bottle of water does not.
    shelfLifeDays: 180,
    expiryMode: 'flexible',
    // Drinks are not meals, so they add no days of food coverage.
    coverageWeight: 0,
    chartRank: 6,
    suggestible: false,
  },
  [FoodType.OTHER]: {
    shelfLifeDays: 120,
    expiryMode: 'strict',
    coverageWeight: 0.4,
    // Too generic to draw a conclusion from, but still alerted on: the user
    // picked a date for it, so the date is honoured.
    chartRank: null,
    suggestible: true,
  },
  [FoodType.HOUSEHOLD]: {
    // Bin bags and detergent do not go off. The union makes 'ignore' the only
    // mode this can pair with.
    shelfLifeDays: null,
    expiryMode: 'ignore',
    coverageWeight: 0,
    chartRank: null,
    suggestible: false,
  },
};

/** Whether a date means anything for this food type at all. */
export function foodTypeExpires(foodType: FoodType): boolean {
  return FOOD_TYPE_PROFILE[foodType].shelfLifeDays !== null;
}
