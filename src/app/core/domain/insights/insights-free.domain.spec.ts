import { FoodType } from '@core/models/shared/enums.model';
import {
  computeActivityMetrics,
  computeDistribution,
  computeFoodCoverage,
  classifyCoverageLevel,
} from './insights-free.domain';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'item-1',
    _rev: '1-abc',
    type: 'item',
    householdId: 'hh1',
    name: 'Test',
    categoryId: 'cat1',
    batches: [],
    productType: 'pantry',
    ...overrides,
  } as PantryItem;
}

function makeEvent(overrides: Partial<PantryEvent> = {}): PantryEvent {
  return {
    _id: 'evt-1',
    _rev: '1-abc',
    type: 'event',
    eventType: 'ADD',
    productId: 'item-1',
    quantity: 1,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as PantryEvent;
}

describe('computeDistribution — display order', () => {
  const now = new Date('2026-05-14');

  it('shows beverages and non-perishables, not just the original five', () => {
    // The reassignment moved tinned tuna, pulses and sugar into non-perishable.
    // A display list that predates those types drops them from the chart, so the
    // products a user actually owns stop being counted at all.
    const items = [
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1 }] }),
      makeItem({ foodType: FoodType.NON_PERISHABLE, batches: [{ batchId: 'b2', quantity: 1 }] }),
      makeItem({ foodType: FoodType.BEVERAGE, batches: [{ batchId: 'b3', quantity: 1 }] }),
    ];
    const shown = computeDistribution(items, [], now, 30).foodTypes.map(f => f.foodType);
    expect(shown).toContain(FoodType.NON_PERISHABLE);
    expect(shown).toContain(FoodType.BEVERAGE);
  });

  it('still leaves household and other out of the chart', () => {
    const items = [
      makeItem({ foodType: FoodType.HOUSEHOLD, batches: [{ batchId: 'b1', quantity: 1 }] }),
      makeItem({ foodType: FoodType.OTHER, batches: [{ batchId: 'b2', quantity: 1 }] }),
    ];
    expect(computeDistribution(items, [], now, 30).foodTypes).toEqual([]);
  });

  it('keeps protein first and never leads with a pantry staple', () => {
    const items = [
      makeItem({ foodType: FoodType.BEVERAGE, batches: [{ batchId: 'b1', quantity: 1 }] }),
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b2', quantity: 1 }] }),
    ];
    const shown = computeDistribution(items, [], now, 30).foodTypes.map(f => f.foodType);
    expect(shown[0]).toBe(FoodType.PROTEIN);
  });
});

describe('computeActivityMetrics', () => {
  const now = new Date('2026-05-14');
  const recentTs = new Date('2026-04-20').toISOString();
  const oldTs = new Date('2026-03-01').toISOString();

  it('counts ADD events within window', () => {
    const events = [
      makeEvent({ eventType: 'ADD', timestamp: recentTs }),
      makeEvent({ eventType: 'ADD', timestamp: oldTs }),
    ];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.added).toBe(1);
  });

  it('counts CONSUME events within window', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.consumed).toBe(1);
  });

  describe('rotationRatio and rotationPercent', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('are both null when there is no recent activity', () => {
      const result = computeActivityMetrics([], 30, now);
      expect(result.rotationRatio).toBeNull();
      expect(result.rotationPercent).toBeNull();
    });

    it('rotationRatio is high and rotationPercent is null when consuming with nothing newly added', () => {
      const events = Array.from({ length: 6 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 6 consumed / 0 added → consuming pre-existing stock → high, but no ratio to show
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('high');
      expect(result.rotationPercent).toBeNull();
    });

    it('is medium when consumed / added is between 0.25 and 0.6', () => {
      const events = [
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs }),
        ...Array.from({ length: 3 }, () =>
          makeEvent({ eventType: 'ADD', timestamp: recentTs })
        ),
      ];
      // 1 consumed / 3 added ≈ 0.33 → medium
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('medium');
      expect(result.rotationPercent).toBeCloseTo(1 / 3);
    });

    it('is low when consumed / added < 0.25', () => {
      const events = [
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs }),
        ...Array.from({ length: 5 }, () =>
          makeEvent({ eventType: 'ADD', timestamp: recentTs })
        ),
      ];
      // 1 consumed / 5 added = 0.2 → low
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('low');
      expect(result.rotationPercent).toBe(0.2);
    });
  });
});

describe('computeDistribution', () => {
  const now = new Date('2026-05-14');
  const recentTs = new Date('2026-04-20').toISOString();

  it('returns food types in fixed order (PROTEIN → VEGETABLE → FRUIT → DAIRY → CARB → OTHER)', () => {
    const items = [
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    // PROTEIN comes before DAIRY in fixed order even though DAIRY has higher count
    expect(result.foodTypes[0].foodType).toBe(FoodType.PROTEIN);
    expect(result.foodTypes[1].foodType).toBe(FoodType.DAIRY);
    expect(result.foodTypes[1].count).toBe(2);
  });

  it('excludes HOUSEHOLD from top food types', () => {
    const items = [
      makeItem({ foodType: FoodType.HOUSEHOLD, batches: [{ batchId: 'b1', quantity: 1 }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.foodTypes.length).toBe(0);
  });

  it('excludes fresh items from top food types', () => {
    const items = [
      makeItem({ productType: 'fresh', foodType: FoodType.DAIRY, batches: [] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.foodTypes.length).toBe(0);
  });

  describe('leastRotatingFoodType', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('returns null when no food type has >= 2 active items', () => {
      const items = [
        makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      ];
      const result = computeDistribution(items, [], now, 30);
      expect(result.leastRotatingFoodType).toBeNull();
    });

    it('returns food type with lowest consumed/count ratio (min 2 items)', () => {
      const items = [
        makeItem({ _id: 'p1', foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'p2', foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'd1', foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'd2', foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      ];
      // DAIRY has 0 consumed events → lower rotation than PROTEIN
      const events = [
        makeEvent({ eventType: 'CONSUME', foodType: FoodType.PROTEIN, timestamp: recentTs }),
        makeEvent({ eventType: 'CONSUME', foodType: FoodType.PROTEIN, timestamp: recentTs }),
      ];
      const result = computeDistribution(items, events, now, 30);
      expect(result.leastRotatingFoodType).toBe(FoodType.DAIRY);
    });
  });

  it('mostWastedFoodType returns null when no EXPIRE events with foodType', () => {
    const result = computeDistribution([], [], now, 30);
    expect(result.mostWastedFoodType).toBeNull();
  });

  it('mostWastedFoodType returns most frequent food type from EXPIRE events', () => {
    const events = [
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.DAIRY, timestamp: recentTs }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.DAIRY, timestamp: recentTs }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.CARB, timestamp: recentTs }),
    ];
    const result = computeDistribution([], events, now, 30);
    expect(result.mostWastedFoodType).toBe(FoodType.DAIRY);
  });
});

describe('computeFoodCoverage', () => {
  it('returns null when fewer than 3 items', () => {
    const items = [makeItem(), makeItem()];
    expect(computeFoodCoverage(items, 1, new Date())).toBeNull();
  });

  it('returns null when total portions are 0', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
    ];
    expect(computeFoodCoverage(items, 1, new Date())).toBeNull();
  });

  it('returns a small number of days for small quantities', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
    ];
    const result = computeFoodCoverage(items, 1, new Date())!;
    expect(result.days).toBeGreaterThan(0);
    expect(result.days).toBeLessThan(30);
  });

  it('returns 30+ days for a well-stocked pantry', () => {
    const items = Array.from({ length: 5 }, () =>
      makeItem({ batches: [{ batchId: 'b1', quantity: 20 }] })
    );
    const result = computeFoodCoverage(items, 1, new Date())!;
    expect(result.days).toBeGreaterThanOrEqual(30);
  });

  it('returns a coverage value for items with foodType', () => {
    const items = [
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 5 }] }),
    ];
    const result = computeFoodCoverage(items, 1, new Date())!;
    expect(result.days).toBeGreaterThan(0);
  });
});

describe('classifyCoverageLevel', () => {
  it('is bad below 3 days', () => {
    expect(classifyCoverageLevel(0)).toBe('bad');
    expect(classifyCoverageLevel(2)).toBe('bad');
  });

  it('is normal between 3 and 7 days', () => {
    expect(classifyCoverageLevel(3)).toBe('normal');
    expect(classifyCoverageLevel(7)).toBe('normal');
  });

  it('is good above 7 days', () => {
    expect(classifyCoverageLevel(8)).toBe('good');
    expect(classifyCoverageLevel(30)).toBe('good');
  });
});

