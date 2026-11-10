import type { PantryEvent } from '@core/models/events';
import { FoodType } from '@core/models/shared/enums.model';
import { learnedDaysFor, learnShelfLifeDays } from './learned-shelf-life.domain';

let n = 0;
const add = (productName: string, daysToExpiry: number | undefined, day: number, foodType?: FoodType): PantryEvent => ({
  _id: `e${++n}`, type: 'event', eventType: 'ADD', productId: `item:${productName}`, productName, quantity: 1,
  daysToExpiry, foodType, timestamp: new Date(Date.UTC(2026, 0, day)).toISOString(),
} as PantryEvent);

describe('learnShelfLifeDays', () => {
  it('takes the median of a product\'s dated additions, by name identity', () => {
    const learned = learnShelfLifeDays([add('Yogur natural', 20, 1), add('yogur  NATURAL', 22, 2), add('Yogur natural', 40, 3)]);
    expect(learned.get('yogur natural')).toBe(22);
  });

  it('only looks at the last five additions', () => {
    const old = [1, 2, 3, 4, 5].map(d => add('Huevos', 5, d));
    const recent = [10, 11, 12, 13, 14].map(d => add('Huevos', 21, d));
    expect(learnShelfLifeDays([...old, ...recent]).get('huevos')).toBe(21);
  });

  it('ignores additions without a date, already expired, or other events', () => {
    const learned = learnShelfLifeDays([
      add('Sal', undefined, 1), add('Leche', -3, 2),
      { ...add('Leche', 90, 3), eventType: 'CONSUME' } as PantryEvent,
    ]);
    expect(learned.size).toBe(0);
  });

  it('skips a date that equals the type default: that was the app\'s own suggestion', () => {
    // DAIRY suggests 14: learning from it would keep suggesting 14 forever.
    const learned = learnShelfLifeDays([add('Leche entera', 14, 1, FoodType.DAIRY), add('Leche entera', 87, 2, FoodType.DAIRY)]);
    expect(learned.get('leche entera')).toBe(87);
  });

  it('keeps what it learned after the product is renamed', () => {
    const learned = learnShelfLifeDays([add('Yogurt natural', 20, 1), add('Yogurt natural', 22, 2)]);
    // Same product id, new name.
    expect(learnedDaysFor(learned, 'Yogur natural', 'item:Yogurt natural')).toBe(21);
    expect(learnedDaysFor(learned, 'Yogur natural')).toBeUndefined();
  });
});
