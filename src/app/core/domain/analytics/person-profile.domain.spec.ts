import type { PantryItem } from '@core/models/pantry';
import { bucketPantrySize, buildPersonProfile, daysSince } from './person-profile.domain';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: `item:${Math.random()}`,
    type: 'product',
    name: 'Producto',
    categoryId: 'cat',
    batches: [],
    productType: 'pantry',
    foodType: 'dry-goods',
    expirationDate: '2026-12-01',
    ...overrides,
  } as PantryItem;
}

const NOW = new Date('2026-09-03T10:00:00.000Z');

describe('bucketPantrySize', () => {
  it('buckets by size rather than reporting an exact count', () => {
    expect(bucketPantrySize(0)).toBe('empty');
    expect(bucketPantrySize(1)).toBe('1-5');
    expect(bucketPantrySize(5)).toBe('1-5');
    expect(bucketPantrySize(6)).toBe('6-20');
    expect(bucketPantrySize(20)).toBe('6-20');
    expect(bucketPantrySize(21)).toBe('21-50');
    expect(bucketPantrySize(50)).toBe('21-50');
    expect(bucketPantrySize(51)).toBe('50+');
  });

  it('treats a negative count as empty rather than throwing', () => {
    expect(bucketPantrySize(-3)).toBe('empty');
  });
});

describe('daysSince', () => {
  it('floors to whole days', () => {
    expect(daysSince(new Date('2026-09-01T23:00:00.000Z'), NOW)).toBe(1);
  });

  it('returns 0 on the first day', () => {
    expect(daysSince(new Date('2026-09-03T09:00:00.000Z'), NOW)).toBe(0);
  });

  it('returns 0 rather than a negative tenure when the clock is skewed forward', () => {
    expect(daysSince(new Date('2026-10-01T00:00:00.000Z'), NOW)).toBe(0);
  });

  it('returns 0 when the date is missing', () => {
    expect(daysSince(null, NOW)).toBe(0);
    expect(daysSince(undefined, NOW)).toBe(0);
  });

  it('returns 0 for an unparseable date instead of NaN', () => {
    expect(daysSince(new Date('nonsense'), NOW)).toBe(0);
  });
});

describe('buildPersonProfile', () => {
  const base = {
    firstOpenAt: new Date('2026-08-24T10:00:00.000Z'),
    now: NOW,
    onboardingDone: true,
    notificationsEnabled: false,
  };

  it('splits despensa from fresh', () => {
    const profile = buildPersonProfile({
      ...base,
      items: [item(), item(), item({ productType: 'fresh' })],
    });
    expect(profile.despensa_items).toBe(2);
    expect(profile.fresh_items).toBe(1);
    expect(profile.pantry_size).toBe('1-5');
    expect(profile.has_items).toBe(true);
  });

  it('describes an empty pantry — the case that explains one-session users', () => {
    const profile = buildPersonProfile({ ...base, items: [] });
    expect(profile.pantry_size).toBe('empty');
    expect(profile.has_items).toBe(false);
    expect(profile.despensa_items).toBe(0);
    expect(profile.fresh_items).toBe(0);
    expect(profile.incomplete_items).toBe(0);
  });

  it('counts a product with no food type as incomplete', () => {
    const profile = buildPersonProfile({ ...base, items: [item({ foodType: undefined })] });
    expect(profile.incomplete_items).toBe(1);
  });

  it('counts a product with a dateless lot as incomplete', () => {
    const profile = buildPersonProfile({
      ...base,
      items: [item({ batches: [{ batchId: 'b1', quantity: 1 }] })],
    });
    expect(profile.incomplete_items).toBe(1);
  });

  it('does not count a lot deliberately marked as never expiring', () => {
    const profile = buildPersonProfile({
      ...base,
      items: [item({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] })],
    });
    expect(profile.incomplete_items).toBe(0);
  });

  it('never counts fresh products as incomplete — they carry no food type or dates by design', () => {
    const profile = buildPersonProfile({
      ...base,
      items: [
        item({
          productType: 'fresh',
          foodType: undefined,
          batches: [{ batchId: 'b1', quantity: 3 }],
        }),
      ],
    });
    expect(profile.incomplete_items).toBe(0);
  });

  it('carries tenure and the two preference flags through', () => {
    const profile = buildPersonProfile({
      ...base,
      items: [],
      onboardingDone: false,
      notificationsEnabled: true,
    });
    expect(profile.days_since_first_open).toBe(10);
    expect(profile.onboarding_done).toBe(false);
    expect(profile.notifications_enabled).toBe(true);
  });

  it('emits no free text — every value is a count, a bucket or a boolean', () => {
    const profile = buildPersonProfile({ ...base, items: [item({ name: 'Leche Hacendado' })] });
    const values = Object.values(profile) as unknown[];
    const buckets = ['empty', '1-5', '6-20', '21-50', '50+'];
    for (const value of values) {
      const ok =
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (typeof value === 'string' && buckets.includes(value));
      expect(ok).toBe(true);
    }
    expect(JSON.stringify(profile)).not.toContain('Hacendado');
  });
});
