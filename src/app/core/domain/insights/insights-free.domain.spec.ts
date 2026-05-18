import { FoodType } from '@core/models/shared/enums.model';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
  computePantryScore,
  computeFoodCoverage,
  computePantryHealthState,
  PantryHealthState,
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

describe('computeInventorySnapshot', () => {
  const now = new Date('2026-05-14');

  it('counts active items (non-expired)', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.total).toBe(1);
    expect(result.active).toBe(1);
    expect(result.expired).toBe(0);
  });

  it('counts expired items and excludes from active', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.expired).toBe(1);
    expect(result.active).toBe(0);
  });

  it('counts review items (dairy expired <7d ago)', () => {
    const items = [
      makeItem({
        foodType: FoodType.DAIRY,
        batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
      }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.review).toBe(1);
    expect(result.active).toBe(1);
    expect(result.expired).toBe(0);
  });

  it('counts basics out of stock', () => {
    const items = [
      makeItem({ isBasic: true, batches: [] }),
      makeItem({ isBasic: true, batches: [{ batchId: 'b1', quantity: 1 }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.basicsOutOfStock).toBe(1);
  });

  it('counts items without expiry date (excluding fresh and noExpiry)', () => {
    const items = [
      makeItem({ batches: [] }),
      makeItem({ productType: 'fresh', batches: [] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.noExpiryDate).toBe(1);
  });

  it('expiredRatio is 0 when total is 0', () => {
    const result = computeInventorySnapshot([], now);
    expect(result.expiredRatio).toBe(0);
  });

  it('expiredRatio is correct', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-01' }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.expiredRatio).toBe(0.5);
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
    const result = computeActivityMetrics(events, 30, now, 10);
    expect(result.added).toBe(1);
  });

  it('counts CONSUME events within window', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now, 10);
    expect(result.consumed).toBe(1);
  });

  it('counts EXPIRE events within window', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now, 10);
    expect(result.expired).toBe(1);
  });

  it('wasteRatio is null when no consumed or expired', () => {
    const result = computeActivityMetrics([], 30, now, 10);
    expect(result.wasteRatio).toBeNull();
  });

  it('wasteRatio is 0 when consumed > 0 and expired = 0', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now, 10);
    expect(result.wasteRatio).toBe(0);
  });

  it('wasteRatio is 1 when expired > 0 and consumed = 0', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now, 10);
    expect(result.wasteRatio).toBe(1);
  });

  describe('rotationRatio', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('is null when activeInventory is 0', () => {
      const result = computeActivityMetrics([], 30, now, 0);
      expect(result.rotationRatio).toBeNull();
    });

    it('is high when consumed / activeInventory >= 0.3', () => {
      const events = Array.from({ length: 6 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 6 consumed / 10 active = 0.6 → high
      const result = computeActivityMetrics(events, 30, now, 10);
      expect(result.rotationRatio).toBe('high');
    });

    it('is medium when consumed / activeInventory is between 0.1 and 0.3', () => {
      const events = Array.from({ length: 2 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 2 consumed / 10 active = 0.2 → medium
      const result = computeActivityMetrics(events, 30, now, 10);
      expect(result.rotationRatio).toBe('medium');
    });

    it('is low when consumed / activeInventory < 0.1', () => {
      const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
      // 1 consumed / 20 active = 0.05 → low
      const result = computeActivityMetrics(events, 30, now, 20);
      expect(result.rotationRatio).toBe('low');
    });
  });
});

describe('computeDistribution', () => {
  const now = new Date('2026-05-14');
  const recentTs = new Date('2026-04-20').toISOString();

  it('returns top food types sorted by count descending', () => {
    const items = [
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes[0].foodType).toBe(FoodType.DAIRY);
    expect(result.topFoodTypes[0].count).toBe(2);
  });

  it('excludes HOUSEHOLD from top food types', () => {
    const items = [
      makeItem({ foodType: FoodType.HOUSEHOLD, batches: [{ batchId: 'b1', quantity: 1 }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes.length).toBe(0);
  });

  it('excludes fresh items from top food types', () => {
    const items = [
      makeItem({ productType: 'fresh', foodType: FoodType.DAIRY, batches: [] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes.length).toBe(0);
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

describe('computePantryScore', () => {
  it('returns null when fewer than 3 items', () => {
    expect(computePantryScore(2, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('returns excellent label when score >= 85 with no issues', () => {
    const result = computePantryScore(10, 0, 0, 0, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.label).toBe('excellent');
  });

  it('applies strong penalty for expired items', () => {
    const result = computePantryScore(10, 2, 0, 0, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(85);
    expect(result!.label).not.toBe('excellent');
  });

  it('applies soft penalty for no-date items', () => {
    const perfect = computePantryScore(10, 0, 0, 0, 0, 0)!;
    const withNoDate = computePantryScore(10, 0, 0, 5, 0, 0)!;
    expect(withNoDate.score).toBeLessThan(perfect.score);
  });

  it('returns poor label when score < 40', () => {
    // max expired penalty (40) + max nearExpiry penalty (20) + noDate penalty (15) = 75 deducted → score 25
    const result = computePantryScore(10, 10, 10, 10, 0, 0);
    expect(result!.score).toBeLessThan(40);
    expect(result!.label).toBe('poor');
  });
});

describe('computeFoodCoverage', () => {
  it('returns null when fewer than 3 items', () => {
    const items = [makeItem(), makeItem()];
    expect(computeFoodCoverage(items)).toBeNull();
  });

  it('returns null when total portions are 0', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
    ];
    expect(computeFoodCoverage(items)).toBeNull();
  });

  it('returns days unit for small quantities', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
    ];
    const result = computeFoodCoverage(items)!;
    expect(result.unit).toBe('days');
    expect(result.value).toBeGreaterThan(0);
  });

  it('returns months unit when >= 30 days', () => {
    const items = Array.from({ length: 5 }, () =>
      makeItem({ batches: [{ batchId: 'b1', quantity: 20 }] })
    );
    const result = computeFoodCoverage(items)!;
    expect(['months', 'years']).toContain(result.unit);
  });

  it('enhanced flag is true when >= 50% of items have foodType', () => {
    const items = [
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 5 }] }),
    ];
    const result = computeFoodCoverage(items)!;
    expect(result.enhanced).toBe(true);
  });
});

describe('computePantryHealthState', () => {
  it('returns CRITICAL when expired > 0', () => {
    expect(computePantryHealthState(2, 0, 10, 5, 0)).toBe(PantryHealthState.CRITICAL);
  });

  it('returns ATTENTION when nearExpiry > 0 and no expired', () => {
    expect(computePantryHealthState(0, 3, 10, 5, 0)).toBe(PantryHealthState.ATTENTION);
  });

  it('returns ATTENTION when total > 10 and fewer than 30% items have dates', () => {
    // total=20, withDates=4 (20%), expired=0, nearExpiry=0
    expect(computePantryHealthState(0, 0, 20, 4, 0)).toBe(PantryHealthState.ATTENTION);
  });

  it('returns OPTIMAL when no issues', () => {
    expect(computePantryHealthState(0, 0, 10, 8, 0)).toBe(PantryHealthState.OPTIMAL);
  });

  it('CRITICAL takes precedence over nearExpiry', () => {
    expect(computePantryHealthState(1, 5, 10, 5, 0)).toBe(PantryHealthState.CRITICAL);
  });
});
