import { FoodType } from '@core/models/shared/enums.model';
import { computeWasteSummary, type WasteSummary } from './waste.domain';
import type { PantryEvent } from '@core/models/events';

const ev = (overrides: Partial<PantryEvent>): PantryEvent => ({
  _id: overrides._id ?? `event:${Math.random()}`,
  _rev: undefined as any,
  type: 'event',
  eventType: overrides.eventType ?? 'EXPIRE',
  productId: overrides.productId ?? 'p1',
  productName: overrides.productName ?? 'Yogur',
  quantity: overrides.quantity ?? 1,
  categoryId: overrides.categoryId ?? 'cat-dairy',
  foodType: (overrides.foodType ?? FoodType.DAIRY) as FoodType,
  timestamp: overrides.timestamp ?? new Date().toISOString(),
  createdAt: overrides.timestamp ?? new Date().toISOString(),
  updatedAt: overrides.timestamp ?? new Date().toISOString(),
});

describe('computeWasteSummary', () => {
  const now = new Date('2026-06-05T12:00:00Z');

  it('returns zeroed summary when no events', () => {
    const result = computeWasteSummary([], now, 30);
    expect(result.totalCount).toBe(0);
    expect(result.byCategory).toEqual([]);
    expect(result.byFoodType).toEqual([]);
    expect(result.topProduct).toBeUndefined();
    expect(result.previousWindowCount).toBe(0);
    expect(result.trend).toBe('flat');
  });

  it('counts only EXPIRE events inside the window', () => {
    const events = [
      ev({ eventType: 'EXPIRE', quantity: 2, timestamp: '2026-06-01T00:00:00Z' }),
      ev({ eventType: 'CONSUME', quantity: 99, timestamp: '2026-06-01T00:00:00Z' }),
      ev({ eventType: 'EXPIRE', quantity: 3, timestamp: '2025-12-01T00:00:00Z' }),
    ];
    const result = computeWasteSummary(events, now, 30);
    expect(result.totalCount).toBe(2);
  });

  it('groups by category and food type', () => {
    const events = [
      ev({ eventType: 'EXPIRE', quantity: 2, categoryId: 'cat-dairy', foodType: FoodType.DAIRY, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ eventType: 'EXPIRE', quantity: 1, categoryId: 'cat-veg',   foodType: FoodType.VEGETABLE, timestamp: '2026-05-21T00:00:00Z' }),
      ev({ eventType: 'EXPIRE', quantity: 4, categoryId: 'cat-dairy', foodType: FoodType.DAIRY, timestamp: '2026-05-22T00:00:00Z' }),
    ];
    const result = computeWasteSummary(events, now, 30);
    const dairy = result.byCategory.find(c => c.categoryId === 'cat-dairy');
    expect(dairy?.count).toBe(6);
    const veg = result.byCategory.find(c => c.categoryId === 'cat-veg');
    expect(veg?.count).toBe(1);
    expect(result.byFoodType.find(f => f.foodType === FoodType.DAIRY)?.count).toBe(6);
  });

  it('returns topProduct as the highest-count product', () => {
    const events = [
      ev({ productId: 'p1', productName: 'Yogur', quantity: 1, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ productId: 'p2', productName: 'Pan',   quantity: 3, timestamp: '2026-05-21T00:00:00Z' }),
      ev({ productId: 'p1', productName: 'Yogur', quantity: 1, timestamp: '2026-05-22T00:00:00Z' }),
    ];
    const result = computeWasteSummary(events, now, 30);
    expect(result.topProduct?.productId).toBe('p2');
    expect(result.topProduct?.count).toBe(3);
  });

  it('computes trend by comparing this window to the immediately preceding one', () => {
    const inThis = [
      ev({ quantity: 5, timestamp: '2026-05-25T00:00:00Z' }),
    ];
    const inPrev = [
      ev({ quantity: 2, timestamp: '2026-04-25T00:00:00Z' }),
    ];
    const result = computeWasteSummary([...inThis, ...inPrev], now, 30);
    expect(result.totalCount).toBe(5);
    expect(result.previousWindowCount).toBe(2);
    expect(result.trend).toBe('up');
  });
});
