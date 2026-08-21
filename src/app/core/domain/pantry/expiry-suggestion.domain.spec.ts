import { FoodType } from '@core/models/shared/enums.model';
import { EXPIRY_SUGGESTION_DAYS, foodTypeExpires, suggestExpiryDate } from './expiry-suggestion.domain';
import { getExpiryModeFromFoodType } from './pantry-status.domain';

describe('suggestExpiryDate', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('adds the configured number of days for the given foodType', () => {
    expect(suggestExpiryDate(FoodType.DAIRY, from)).toBe('2026-01-15');
  });

  it('matches EXPIRY_SUGGESTION_DAYS for every FoodType value', () => {
    for (const type of Object.values(FoodType)) {
      const days = EXPIRY_SUGGESTION_DAYS[type];
      if (days === null) {
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

  it('invents no date for household, which genuinely never expires', () => {
    expect(suggestExpiryDate(FoodType.HOUSEHOLD, from)).toBeUndefined();
    expect(foodTypeExpires(FoodType.HOUSEHOLD)).toBe(false);
  });

  it('dates every other type, including store-cupboard staples', () => {
    // Oil, coffee and tins carry a real best-before, just a distant one, so
    // they are dated rather than treated like bin bags.
    for (const type of Object.values(FoodType)) {
      if (type === FoodType.HOUSEHOLD) continue;
      expect(foodTypeExpires(type)).withContext(type).toBe(true);
      expect(suggestExpiryDate(type, from)).withContext(type).toBeDefined();
    }
  });

  it('never shows a date the expiry rules will ignore, nor ignores a dated type', () => {
    // The invariant that keeps the two tables honest. Breaking it in either
    // direction is a user-visible bug: a date printed and never acted on, or a
    // product that needs a date and is given none.
    for (const type of Object.values(FoodType)) {
      const ignored = getExpiryModeFromFoodType(type) === 'ignore';
      expect(foodTypeExpires(type))
        .withContext(`${type}: expires=${foodTypeExpires(type)} mode=${getExpiryModeFromFoodType(type)}`)
        .toBe(!ignored);
    }
  });

  it('does not mutate the fromDate argument', () => {
    const original = new Date('2026-06-01T00:00:00');
    const copy = new Date(original);
    suggestExpiryDate(FoodType.PROTEIN, original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
