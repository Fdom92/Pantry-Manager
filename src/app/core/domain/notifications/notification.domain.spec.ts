import { filterExpiredItems, filterNearExpiryItems, pickPriorityItem } from './notification.domain';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';

function makeItem(name: string, expirationDate?: string): PantryItem {
  return {
    _id: `item:${name}`,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    batches: expirationDate
      ? [{ quantity: 1, expirationDate }]
      : [{ quantity: 1 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('pickPriorityItem', () => {
  const now = new Date('2026-06-02T08:00:00.000Z');

  it('returns the earliest-expiring item for kind=expired', () => {
    const items = [
      makeItem('yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('milk', '2026-05-15T00:00:00.000Z'),
      makeItem('cheese', '2026-06-01T00:00:00.000Z'),
    ];
    const winner = pickPriorityItem(items, 'expired', now);
    expect(winner?.name).toBe('milk');
  });

  it('returns the earliest-expiring item for kind=near-expiry', () => {
    const items = [
      makeItem('apples', '2026-06-10T00:00:00.000Z'),
      makeItem('bread', '2026-06-04T00:00:00.000Z'),
    ];
    const winner = pickPriorityItem(items, 'near-expiry', now);
    expect(winner?.name).toBe('bread');
  });

  it('returns the alphabetically-first item for kind=low-stock when no expiry signal', () => {
    const items = [makeItem('rice'), makeItem('flour'), makeItem('sugar')];
    const winner = pickPriorityItem(items, 'low-stock', now);
    expect(winner?.name).toBe('flour');
  });

  it('falls back to the first item if everything is undefined', () => {
    const items = [makeItem('only')];
    expect(pickPriorityItem(items, 'expired', now)?.name).toBe('only');
  });

  it('returns null on empty input', () => {
    expect(pickPriorityItem([], 'expired', now)).toBeNull();
  });
});

describe('notification filters — types the app does not police', () => {
  const yesterday = '2020-01-01';
  const now = new Date('2020-01-10T12:00:00');

  const withType = (name: string, foodType: FoodType): PantryItem =>
    ({ ...makeItem(name, yesterday), foodType });

  it('does not report an expired household product', () => {
    // Bleach with an old date reads as 'normal' on every screen, because the
    // expiry rules ignore household. A notification saying otherwise sends the
    // user to look at something the app itself considers fine.
    expect(filterExpiredItems([withType('Lejía', FoodType.HOUSEHOLD)], now)).toEqual([]);
  });

  it('still reports an expired food product', () => {
    const milk = withType('Leche', FoodType.DAIRY);
    expect(filterExpiredItems([milk], now).length).toBe(1);
  });

  it('reports an expired product with no type at all', () => {
    // No type means no reason to stay quiet — silence is the dangerous default.
    expect(filterExpiredItems([makeItem('Sin tipo', yesterday)], now).length).toBe(1);
  });

  it('leaves household out of the near-expiry warning too', () => {
    const soon = '2020-01-12';
    const bags = { ...makeItem('Bolsas', soon), foodType: FoodType.HOUSEHOLD } as PantryItem;
    expect(filterNearExpiryItems([bags], now, 15)).toEqual([]);
    expect(filterNearExpiryItems([makeItem('Yogur', soon)], now, 15).length).toBe(1);
  });
});
