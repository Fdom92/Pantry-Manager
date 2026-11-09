import type { PantryEvent } from '@core/models/events';
import type { PantryItem } from '@core/models/pantry';
import { computeSavedInTime, computeStaleProducts, computeTopUsed, STALE_AFTER_DAYS } from './pantry-habits.domain';

const NOW = new Date('2026-11-09T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const item = (id: string, over: Partial<PantryItem> = {}): PantryItem => ({
  _id: id, type: 'item', householdId: 'h', name: id, categoryId: '',
  batches: [{ batchId: 'b', quantity: 1 }], createdAt: daysAgo(300), ...over,
} as PantryItem);

const ev = (productId: string, eventType: PantryEvent['eventType'], ago: number, over: Partial<PantryEvent> = {}): PantryEvent => ({
  _id: `e:${Math.random()}`, type: 'event', eventType, productId, quantity: 1, timestamp: daysAgo(ago), ...over,
} as PantryEvent);

describe('computeStaleProducts', () => {
  it('lists products with stock untouched for STALE_AFTER_DAYS, longest idle first', () => {
    const items = [item('quesitos'), item('miel'), item('leche'), item('vacio', { batches: [] })];
    const events = [
      ev('quesitos', 'EDIT', 140), ev('miel', 'CONSUME', STALE_AFTER_DAYS + 5), ev('leche', 'CONSUME', 3), ev('vacio', 'ADD', 200),
    ];
    expect(computeStaleProducts(items, events, NOW).map(s => s.item._id)).toEqual(['quesitos', 'miel']);
  });

  it('does not count the expiry sweep as the user touching it, but does count a discard', () => {
    const items = [item('swept'), item('thrown')];
    const events = [ev('swept', 'EXPIRE', 2), ev('thrown', 'EXPIRE', 2, { source: 'discard' })];
    expect(computeStaleProducts(items, events, NOW).map(s => s.item._id)).toEqual(['swept']);
  });

  it('a product created recently is not stale even with no events', () => {
    expect(computeStaleProducts([item('nuevo', { createdAt: daysAgo(10) })], [], NOW)).toEqual([]);
  });
});

describe('computeTopUsed', () => {
  it('ranks by units used in the window and flags the ones not marked basic', () => {
    const items = [item('flan'), item('leche', { isBasic: true }), item('viejo')];
    const events = [
      ev('flan', 'CONSUME', 5, { quantity: 4 }), ev('leche', 'CONSUME', 2, { quantity: 2 }),
      ev('viejo', 'CONSUME', 200, { quantity: 9 }), ev('borrado', 'CONSUME', 1, { quantity: 9 }),
    ];
    expect(computeTopUsed(items, events, NOW)).toEqual([
      { productId: 'flan', name: 'flan', units: 4, suggestBasic: true },
      { productId: 'leche', name: 'leche', units: 2, suggestBasic: false },
    ]);
  });
});

describe('computeSavedInTime', () => {
  it('counts products used within a week of their date against products wasted', () => {
    const events = [
      ev('yogur', 'CONSUME', 3, { daysToExpiry: 2 }),
      ev('yogur', 'CONSUME', 4, { daysToExpiry: 1 }),
      ev('arroz', 'CONSUME', 3, { daysToExpiry: 300 }),
      ev('nata', 'EXPIRE', 5),
      ev('kefir', 'EXPIRE', 60),
    ];
    expect(computeSavedInTime(events, NOW)).toEqual({ saved: 1, wasted: 1 });
  });
});
