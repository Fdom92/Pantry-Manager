import { ExpiredItemsNotification } from './expired-items.notification';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationContext } from '@core/models/notifications';
import type { PantryItem } from '@core/models/pantry';

function makeItem(id: string, name: string, expirationDate: string): PantryItem {
  return {
    _id: id,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    batches: [{ quantity: 1, expirationDate }],
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
      notifyOnExpired: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now: new Date('2026-06-02T08:00:00.000Z'),
  };
}

describe('ExpiredItemsNotification — smart copy', () => {
  const def = new ExpiredItemsNotification();

  it('returns null when nothing expired', () => {
    expect(def.build(makeCtx([]))).toBeNull();
  });

  it('embeds extra.itemId of the priority winner', () => {
    const items = [
      makeItem('item:a', 'yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('item:b', 'milk',   '2026-05-15T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.id).toBe(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(out.extra).toEqual({ itemId: 'item:b' });
  });

  it('uses _one_named copy for single expired item', () => {
    const items = [makeItem('item:b', 'milk', '2026-05-15T00:00:00.000Z')];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.expired.body_one_named');
    expect(out.body).toContain('"name":"milk"');
  });

  it('uses _many_named copy with others=N-1 for multiple', () => {
    const items = [
      makeItem('item:a', 'yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('item:b', 'milk',   '2026-05-15T00:00:00.000Z'),
      makeItem('item:c', 'cheese', '2026-06-01T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.expired.body_many_named');
    expect(out.body).toContain('"name":"milk"');
    expect(out.body).toContain('"others":2');
  });
});
