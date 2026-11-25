import { FoodType } from '@core/models/shared/enums.model';
import { foodTypeExpires, suggestExpiryDate } from './expiry-suggestion.domain';
import { FOOD_CLASSES, genericClassFor } from './food-classes.data';
import { getExpiryModeFromFoodType } from './pantry-status.domain';

describe('suggestExpiryDate', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('adds the sealed days of the class', () => {
    for (const klass of FOOD_CLASSES) {
      if (klass.sealedDays === null) {
        expect(suggestExpiryDate(klass, from)).withContext(klass.key).toBeUndefined();
        continue;
      }
      const expected = new Date(from);
      expected.setDate(expected.getDate() + klass.sealedDays);
      const m = String(expected.getMonth() + 1).padStart(2, '0');
      const d = String(expected.getDate()).padStart(2, '0');
      expect(suggestExpiryDate(klass, from)).withContext(klass.key).toBe(`${expected.getFullYear()}-${m}-${d}`);
    }
  });

  it('invents no date for household, which genuinely never expires', () => {
    expect(suggestExpiryDate(genericClassFor(FoodType.HOUSEHOLD), from)).toBeUndefined();
    expect(foodTypeExpires(FoodType.HOUSEHOLD)).toBe(false);
  });

  it('dates every other type, including store-cupboard staples', () => {
    for (const type of Object.values(FoodType)) {
      if (type === FoodType.HOUSEHOLD) continue;
      expect(foodTypeExpires(type)).withContext(type).toBe(true);
      expect(suggestExpiryDate(genericClassFor(type), from)).withContext(type).toBeDefined();
    }
  });

  it('never shows a date the expiry rules will ignore, nor ignores a dated type', () => {
    for (const type of Object.values(FoodType)) {
      const ignored = getExpiryModeFromFoodType(type) === 'ignore';
      expect(foodTypeExpires(type)).withContext(type).toBe(!ignored);
    }
  });

  it('does not mutate the fromDate argument', () => {
    const original = new Date('2026-06-01T00:00:00');
    const copy = new Date(original);
    suggestExpiryDate(genericClassFor(FoodType.PROTEIN), original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
