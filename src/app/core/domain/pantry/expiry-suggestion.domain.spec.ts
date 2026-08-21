import { FoodType } from '@core/models/shared/enums.model';
import { EXPIRY_SUGGESTION_DAYS, NEVER_EXPIRES, foodTypeExpires, suggestExpiryDate } from './expiry-suggestion.domain';

describe('suggestExpiryDate', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('adds the configured number of days for the given foodType', () => {
    expect(suggestExpiryDate(FoodType.DAIRY, from)).toBe('2026-01-15');
  });

  it('matches EXPIRY_SUGGESTION_DAYS for every FoodType value', () => {
    for (const type of Object.values(FoodType)) {
      const days = EXPIRY_SUGGESTION_DAYS[type];
      if (days === NEVER_EXPIRES) {
        expect(suggestExpiryDate(type, from)).toBeUndefined();
        continue;
      }
      const expected = new Date(from);
      expected.setDate(expected.getDate() + days);
      const y = expected.getFullYear();
      const m = String(expected.getMonth() + 1).padStart(2, '0');
      const d = String(expected.getDate()).padStart(2, '0');
      expect(suggestExpiryDate(type, from)).toBe(`${y}-${m}-${d}`);
    }
  });

  it('invents no date for a type that never expires', () => {
    // Bin bags and salt do not go off. A number here would be printed on screen
    // and then ignored by getExpiryModeFromFoodType, which reads as a bug.
    expect(suggestExpiryDate(FoodType.HOUSEHOLD, from)).toBeUndefined();
    expect(suggestExpiryDate(FoodType.NON_PERISHABLE, from)).toBeUndefined();
    expect(foodTypeExpires(FoodType.HOUSEHOLD)).toBe(false);
    expect(foodTypeExpires(FoodType.NON_PERISHABLE)).toBe(false);
  });

  it('still dates every type that genuinely spoils', () => {
    for (const type of [FoodType.PROTEIN, FoodType.VEGETABLE, FoodType.FRUIT,
                        FoodType.DAIRY, FoodType.CARB, FoodType.BEVERAGE, FoodType.OTHER]) {
      expect(foodTypeExpires(type)).toBe(true);
      expect(suggestExpiryDate(type, from)).toBeDefined();
    }
  });

  it('does not mutate the fromDate argument', () => {
    const original = new Date('2026-06-01T00:00:00');
    const copy = new Date(original);
    suggestExpiryDate(FoodType.PROTEIN, original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
