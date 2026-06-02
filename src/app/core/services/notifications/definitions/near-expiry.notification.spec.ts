import { NearExpiryNotification } from './near-expiry.notification';
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

function makeCtx(items: PantryItem[], now: Date): NotificationContext {
  return {
    items,
    preferences: {
      theme: 'system',
      nearExpiryDays: 15,
      compactView: false,
      notificationsEnabled: true,
      notifyOnNearExpiry: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now,
  };
}

describe('NearExpiryNotification — smart copy', () => {
  const def = new NearExpiryNotification();

  it('uses _one_named_tomorrow copy when nearestDays=1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const tomorrow = '2026-06-03T08:00:00.000Z';
    const out = def.build(makeCtx([makeItem('item:y', 'yogurt', tomorrow)], now))!;
    expect(out.extra).toEqual({ itemId: 'item:y' });
    expect(out.body).toContain('notifications.nearExpiry.body_one_named_tomorrow');
    expect(out.body).toContain('"name":"yogurt"');
  });

  it('uses _one_named copy when nearestDays>1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const inFive = '2026-06-07T08:00:00.000Z';
    const out = def.build(makeCtx([makeItem('item:b', 'bread', inFive)], now))!;
    expect(out.body).toContain('notifications.nearExpiry.body_one_named');
    expect(out.body).toContain('"days":5');
  });

  it('uses _many_named copy with others=N-1 when count>1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const items = [
      makeItem('item:a', 'apple', '2026-06-10T00:00:00.000Z'),
      makeItem('item:b', 'bread', '2026-06-04T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items, now))!;
    expect(out.body).toContain('notifications.nearExpiry.body_many_named');
    expect(out.body).toContain('"name":"bread"');
    expect(out.body).toContain('"others":1');
    expect(out.id).toBe(NOTIFICATION_IDS.NEAR_EXPIRY);
  });
});
