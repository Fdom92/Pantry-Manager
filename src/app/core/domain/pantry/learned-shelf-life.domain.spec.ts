import type { PantryEvent } from '@core/models/events';
import { FoodType } from '@core/models/shared/enums.model';
import { LEARNED_CLASS_MIN_SAMPLES, learnedDaysFor, learnShelfLifeDays } from './learned-shelf-life.domain';

let n = 0;
const add = (productName: string, daysToExpiry: number | undefined, day: number, foodType?: FoodType): PantryEvent => ({
  _id: `e${++n}`, type: 'event', eventType: 'ADD', productId: `item:${productName}`, productName, quantity: 1,
  daysToExpiry, foodType, timestamp: new Date(Date.UTC(2026, 0, day)).toISOString(),
} as PantryEvent);

describe('learnShelfLifeDays', () => {
  it('takes the median of a product\'s dated additions, by name identity', () => {
    const learned = learnShelfLifeDays([add('Yogur natural', 20, 1), add('yogur  NATURAL', 22, 2), add('Yogur natural', 40, 3)]);
    expect(learned.byProduct.get('yogur natural')).toBe(22);
  });

  it('only looks at the last five additions', () => {
    const old = [1, 2, 3, 4, 5].map(d => add('Huevos', 5, d));
    const recent = [10, 11, 12, 13, 14].map(d => add('Huevos', 21, d));
    expect(learnShelfLifeDays([...old, ...recent]).byProduct.get('huevos')).toBe(21);
  });

  it('ignores additions without a date, already expired, or other events', () => {
    const learned = learnShelfLifeDays([
      add('Sal', undefined, 1), add('Leche', -3, 2),
      { ...add('Leche', 90, 3), eventType: 'CONSUME' } as PantryEvent,
    ]);
    expect(learned.byProduct.size).toBe(0);
  });

  it('skips a date that equals the type default: that was the app\'s own suggestion', () => {
    // DAIRY suggests 14: learning from it would keep suggesting 14 forever.
    const learned = learnShelfLifeDays([add('Leche entera', 14, 1, FoodType.DAIRY), add('Leche entera', 87, 2, FoodType.DAIRY)]);
    expect(learned.byProduct.get('leche entera')).toBe(87);
  });

  it('keeps what it learned after the product is renamed', () => {
    const learned = learnShelfLifeDays([add('Yogurt natural', 20, 1), add('Yogurt natural', 22, 2)]);
    // Same product id, new name.
    expect(learnedDaysFor(learned, 'Yogur natural', 'item:Yogurt natural').product).toBe(21);
    expect(learnedDaysFor(learned, 'Yogur natural').product).toBeUndefined();
  });

  describe('user dates only', () => {
    const withFlag = (e: PantryEvent, dateFromUser?: boolean) => ({ ...e, dateFromUser }) as PantryEvent;

    it('counts dateFromUser true even when it equals the old default, drops false', () => {
      const learned = learnShelfLifeDays([
        withFlag(add('Leche entera', 14, 1, FoodType.DAIRY), true),
        withFlag(add('Leche entera', 30, 2, FoodType.DAIRY), false),
      ]);
      expect(learned.byProduct.get('leche entera')).toBe(14);
    });

    it('old events without the flag count unless they equal the old default (no throw)', () => {
      const learned = learnShelfLifeDays([add('Queso', 14, 1, FoodType.DAIRY), add('Queso', 45, 2, FoodType.DAIRY)]);
      expect(learned.byProduct.get('queso')).toBe(45);
    });

    it('a frozen lot (no date or non-positive days) does not count', () => {
      const learned = learnShelfLifeDays([withFlag(add('Pollo', 0, 1), true), withFlag(add('Pollo', undefined, 2), true)]);
      expect(learned.byProduct.size).toBe(0);
      expect(learned.byClass.size).toBe(0);
    });
  });

  describe('by class', () => {
    const yogurts = ['Yogur natural', 'Yogur griego', 'Yogur de fresa'];

    it('needs the minimum samples, then takes the median', () => {
      const events = yogurts.map((n, i) => add(n, [20, 30, 40][i], i + 1, FoodType.DAIRY));
      expect(LEARNED_CLASS_MIN_SAMPLES).toBe(3);
      expect(learnShelfLifeDays(events.slice(0, 2)).byClass.size).toBe(0);
      const learned = learnShelfLifeDays(events);
      const days = learnedDaysFor(learned, 'Yogur de coco', undefined, undefined, FoodType.DAIRY);
      expect(days.klass).toBe(30);
      expect(days.product).toBeUndefined();
    });

    it('uses the stored foodKind before the class of the name', () => {
      const events = [20, 30, 40].map((d, i) => ({ ...add(`Cosa ${i}`, d, i + 1, FoodType.DAIRY), foodKind: 'yogurt' }) as PantryEvent);
      const byKind = learnShelfLifeDays(events);
      expect(learnedDaysFor(byKind, 'Yogur', undefined, 'yogurt', FoodType.DAIRY).klass).toBe(30);
    });
  });
});
