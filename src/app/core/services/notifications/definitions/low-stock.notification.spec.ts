import { LowStockNotification } from './low-stock.notification';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationContext } from '@core/models/notifications';
import type { PantryItem } from '@core/models/pantry';

function makeBasic(id: string, name: string, qty: number, min = 1): PantryItem {
  return {
    _id: id,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    isBasic: true,
    minThreshold: min,
    batches: [{ quantity: qty }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCtx(items: PantryItem[]): NotificationContext {
  return {
    items,
    preferences: {
      theme: 'system',
      nearExpiryDays: 15,
      compactView: false,
      notificationsEnabled: true,
      notifyOnLowStock: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now: new Date('2026-06-02T08:00:00.000Z'),
  };
}

describe('LowStockNotification — smart copy', () => {
  const def = new LowStockNotification();

  it('uses _one_named for single below-threshold basic', () => {
    const out = def.build(makeCtx([makeBasic('item:r', 'rice', 0)]))!;
    expect(out.id).toBe(NOTIFICATION_IDS.LOW_STOCK);
    expect(out.extra).toEqual({ itemId: 'item:r' });
    expect(out.body).toContain('notifications.lowStock.body_one_named');
    expect(out.body).toContain('"name":"rice"');
  });

  it('uses _many_named with others=N-1 for multiple', () => {
    const items = [
      makeBasic('item:s', 'sugar', 0),
      makeBasic('item:f', 'flour', 0),
      makeBasic('item:r', 'rice', 0),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.lowStock.body_many_named');
    expect(out.body).toContain('"name":"flour"');
    expect(out.body).toContain('"others":2');
  });
});
