import { computeRepositionPredictions } from './reposition.domain';
import type { PantryItem } from '@core/models/pantry/item.model';
import type { PantryEvent } from '@core/models/events';

const item = (over: Partial<PantryItem>): PantryItem => ({
  _id: over._id ?? 'p1',
  _rev: undefined as any,
  type: 'item',
  householdId: 'h1',
  name: over.name ?? 'Café',
  categoryId: over.categoryId ?? 'beverage',
  batches: over.batches ?? [{ batchId: 'b1', quantity: 4, expirationDate: undefined as any, opened: false } as any],
  isBasic: over.isBasic ?? true,
  productType: (over as any).productType ?? 'pantry',
  noExpiry: (over as any).noExpiry ?? true,
  createdAt: (over as any).createdAt ?? '2026-04-01T00:00:00Z',
  updatedAt: (over as any).updatedAt ?? '2026-06-01T00:00:00Z',
} as any);

const ev = (over: Partial<PantryEvent>): PantryEvent => ({
  _id: over._id ?? `e:${Math.random()}`,
  _rev: undefined as any,
  type: 'event',
  eventType: over.eventType ?? 'CONSUME',
  productId: over.productId ?? 'p1',
  quantity: over.quantity ?? 1,
  timestamp: over.timestamp ?? '2026-05-15T00:00:00Z',
  createdAt: over.timestamp ?? '2026-05-15T00:00:00Z',
  updatedAt: over.timestamp ?? '2026-05-15T00:00:00Z',
} as any);

describe('computeRepositionPredictions', () => {
  const now = new Date('2026-06-05T00:00:00Z');

  it('returns empty when no items', () => {
    expect(computeRepositionPredictions([], [], now)).toEqual([]);
  });

  it('skips fresh items', () => {
    const items = [item({ _id: 'fp', productType: 'fresh' } as any)];
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ productId: 'fp', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
    );
    expect(computeRepositionPredictions(items, events, now)).toEqual([]);
  });

  it('skips when velocity below threshold', () => {
    // 1 consume in 30 days = 0.033/day, below 0.05 threshold
    const items = [item({ _id: 'p1' })];
    const events = [ev({ productId: 'p1', quantity: 1, timestamp: '2026-05-20T00:00:00Z' })];
    expect(computeRepositionPredictions(items, events, now)).toEqual([]);
  });

  it('hides low confidence (<3 events)', () => {
    // Above velocity threshold via large quantity, but only 2 events
    const items = [item({ _id: 'p1' })];
    const events = [
      ev({ productId: 'p1', quantity: 3, timestamp: '2026-05-20T00:00:00Z' }),
      ev({ productId: 'p1', quantity: 3, timestamp: '2026-05-25T00:00:00Z' }),
    ];
    expect(computeRepositionPredictions(items, events, now)).toEqual([]);
  });

  it('computes days-to-out, velocity, and high confidence', () => {
    const items = [item({ _id: 'p1', batches: [{ batchId: 'b', quantity: 4 } as any] })];
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ productId: 'p1', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
    );
    const result = computeRepositionPredictions(items, events, now);
    expect(result.length).toBe(1);
    const p = result[0];
    expect(p.productId).toBe('p1');
    expect(p.currentStock).toBe(4);
    expect(p.velocityPerDay).toBeCloseTo(10 / 30, 5);
    expect(p.daysToOut).toBe(Math.round(4 / (10 / 30)));
    expect(p.confidence).toBe('high');
  });

  it('caps daysToOut at 90', () => {
    const items = [item({ _id: 'p1', batches: [{ batchId: 'b', quantity: 1000 } as any] })];
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ productId: 'p1', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
    );
    const result = computeRepositionPredictions(items, events, now);
    expect(result[0].daysToOut).toBe(90);
  });

  it('sorts results by daysToOut ascending', () => {
    const items = [
      item({ _id: 'p1', name: 'Café',   batches: [{ batchId: 'b', quantity: 50 } as any] }),
      item({ _id: 'p2', name: 'Azúcar', batches: [{ batchId: 'b', quantity: 5  } as any] }),
    ];
    const events = [
      ...Array.from({ length: 10 }, (_, i) =>
        ev({ productId: 'p1', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        ev({ productId: 'p2', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
      ),
    ];
    const result = computeRepositionPredictions(items, events, now);
    expect(result.map((p: { productId: string }) => p.productId)).toEqual(['p2', 'p1']);
  });

  it('skips items with zero stock', () => {
    const items = [item({ _id: 'p1', batches: [{ batchId: 'b', quantity: 0 } as any] })];
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ productId: 'p1', quantity: 1, timestamp: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString() })
    );
    expect(computeRepositionPredictions(items, events, now)).toEqual([]);
  });
});
