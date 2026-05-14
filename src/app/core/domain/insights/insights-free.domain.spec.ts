import { FoodType } from '@core/models/shared/enums.model';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
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
    const result = computeActivityMetrics(events, 30, now);
    expect(result.added).toBe(1);
  });

  it('counts CONSUME events within window', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.consumed).toBe(1);
  });

  it('counts EXPIRE events within window', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.expired).toBe(1);
  });

  it('wasteRatio is null when no consumed or expired', () => {
    const result = computeActivityMetrics([], 30, now);
    expect(result.wasteRatio).toBeNull();
  });

  it('wasteRatio is 0 when consumed > 0 and expired = 0', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.wasteRatio).toBe(0);
  });

  it('wasteRatio is 1 when expired > 0 and consumed = 0', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.wasteRatio).toBe(1);
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
