import { FoodType } from '@core/models/shared/enums.model';
import { EXPIRY_SUGGESTION_DAYS, suggestExpiryDate } from './expiry-suggestion.domain';

describe('suggestExpiryDate', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('adds the configured number of days for the given foodType', () => {
    expect(suggestExpiryDate(FoodType.DAIRY, from)).toBe('2026-01-15');
  });

  it('matches EXPIRY_SUGGESTION_DAYS for every FoodType value', () => {
    for (const type of Object.values(FoodType)) {
      const days = EXPIRY_SUGGESTION_DAYS[type];
      const expected = new Date(from);
      expected.setDate(expected.getDate() + days);
      const y = expected.getFullYear();
      const m = String(expected.getMonth() + 1).padStart(2, '0');
      const d = String(expected.getDate()).padStart(2, '0');
      expect(suggestExpiryDate(type, from)).toBe(`${y}-${m}-${d}`);
    }
  });

  it('does not mutate the fromDate argument', () => {
    const original = new Date('2026-06-01T00:00:00');
    const copy = new Date(original);
    suggestExpiryDate(FoodType.PROTEIN, original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
