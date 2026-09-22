import { FoodType } from '@core/models/shared/enums.model';
import { computeWasteSummary } from './waste.domain';
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
    expect(result.previousWindowCount).toBe(0);
    expect(result.trend).toBe('flat');
  });

  it('counts only EXPIRE events inside the window', () => {
    const events = [
      ev({ productId: 'p1', eventType: 'EXPIRE', timestamp: '2026-06-01T00:00:00Z' }),
      ev({ productId: 'p2', eventType: 'CONSUME', timestamp: '2026-06-01T00:00:00Z' }),
      ev({ productId: 'p3', eventType: 'EXPIRE', timestamp: '2025-12-01T00:00:00Z' }),
    ];
    expect(computeWasteSummary(events, now, 30).totalCount).toBe(1);
  });

  // The card says "Has tirado N productos": 6 yogures + 4 huevos are 2 products,
  // not 10 (it summed units until 5.5).
  it('counts products, not units', () => {
    const events = [
      ev({ productId: 'yogur', quantity: 6, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ productId: 'huevos', quantity: 4, timestamp: '2026-05-21T00:00:00Z' }),
    ];
    expect(computeWasteSummary(events, now, 30).totalCount).toBe(2);
  });

  it('counts a product once even when several of its batches expired', () => {
    const events = [
      ev({ productId: 'yogur', quantity: 2, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ productId: 'yogur', quantity: 3, timestamp: '2026-05-28T00:00:00Z' }),
    ];
    expect(computeWasteSummary(events, now, 30).totalCount).toBe(1);
  });

  it('ignores expired batches that were already empty', () => {
    const events = [ev({ productId: 'p1', quantity: 0, timestamp: '2026-05-20T00:00:00Z' })];
    expect(computeWasteSummary(events, now, 30).totalCount).toBe(0);
  });

  it('groups products by category and food type', () => {
    const events = [
      ev({ productId: 'yogur', quantity: 2, categoryId: 'cat-dairy', foodType: FoodType.DAIRY, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ productId: 'lechuga', quantity: 1, categoryId: 'cat-veg', foodType: FoodType.VEGETABLE, timestamp: '2026-05-21T00:00:00Z' }),
      ev({ productId: 'queso', quantity: 4, categoryId: 'cat-dairy', foodType: FoodType.DAIRY, timestamp: '2026-05-22T00:00:00Z' }),
      ev({ productId: 'yogur', quantity: 1, categoryId: 'cat-dairy', foodType: FoodType.DAIRY, timestamp: '2026-05-23T00:00:00Z' }),
    ];
    const result = computeWasteSummary(events, now, 30);
    expect(result.byCategory).toEqual([
      { categoryId: 'cat-dairy', count: 2 },
      { categoryId: 'cat-veg', count: 1 },
    ]);
    expect(result.byFoodType.find(f => f.foodType === FoodType.DAIRY)?.count).toBe(2);
  });

  it('computes trend by comparing this window to the immediately preceding one', () => {
    const events = [
      ev({ productId: 'a', timestamp: '2026-05-25T00:00:00Z' }),
      ev({ productId: 'b', timestamp: '2026-05-26T00:00:00Z' }),
      ev({ productId: 'c', timestamp: '2026-04-25T00:00:00Z' }),
    ];
    const result = computeWasteSummary(events, now, 30);
    expect(result.totalCount).toBe(2);
    expect(result.previousWindowCount).toBe(1);
    expect(result.trend).toBe('up');
  });
});
