import { FoodType } from '@core/models/shared/enums.model';
import { countMissingExpiryBatches, hasMissingExpiry, isIncomplete, isPantrySortMode, isStatusChipVisible, matchesFilters, sortPantryItems, statusFilterCount } from './pantry-filtering.domain';
import type { PantryFilterState, PantryItem } from '@core/models/pantry';

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'test-id',
    _rev: '1-abc',
    type: 'item',
    householdId: 'hh1',
    name: 'Test Item',
    categoryId: 'cat1',
    batches: [],
    productType: 'pantry',
    ...overrides,
  } as PantryItem;
}

const noFilters: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
  review: false,
  pendientes: false,
};

describe('matchesFilters — review filter', () => {
  it('passes all items when review filter is false', () => {
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(-3) }],
    });
    expect(matchesFilters(item, { ...noFilters, review: false })).toBeTrue();
  });

  it('passes review-state items (DAIRY 3 days past date, within 7d grace)', () => {
    // DAIRY has flexible mode → 'review' state for up to 7 days past printed date
    const reviewItem = makeItem({
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(-3) }],
    });
    expect(matchesFilters(reviewItem, { ...noFilters, review: true })).toBeTrue();
  });

  it('blocks non-review items (PROTEIN — strict mode, same date is expired not review)', () => {
    const expiredItem = makeItem({
      foodType: FoodType.PROTEIN,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(-3) }],
    });
    expect(matchesFilters(expiredItem, { ...noFilters, review: true })).toBeFalse();
  });

  it('blocks DAIRY item past grace period (>7 days expired)', () => {
    const tooOld = makeItem({
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(-10) }],
    });
    expect(matchesFilters(tooOld, { ...noFilters, review: true })).toBeFalse();
  });
});

describe('isIncomplete', () => {
  it('is incomplete when foodType is missing, even with a full expirationDate', () => {
    const item = makeItem({
      foodType: undefined,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) }],
    });
    expect(isIncomplete(item)).toBeTrue();
  });

  it('is complete when foodType is set and every batch has a date', () => {
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });

  it('is incomplete when foodType is set but a batch is missing a date and not noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [
        { batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) },
        { batchId: 'b2', quantity: 1 },
      ],
    });
    expect(isIncomplete(item)).toBeTrue();
  });

  it('is complete when the only dateless batch is explicitly marked noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });

  it('fresh items with foodType set are always complete, regardless of batches', () => {
    const item = makeItem({
      foodType: FoodType.VEGETABLE,
      productType: 'fresh',
      batches: [{ batchId: 'b1', quantity: 1 }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });
});

describe('hasMissingExpiry', () => {
  it('is false for fresh items regardless of batch dates', () => {
    const item = makeItem({ productType: 'fresh', batches: [{ batchId: 'b1', quantity: 1 }] });
    expect(hasMissingExpiry(item)).toBeFalse();
  });

  it('is true when any pantry batch lacks a date and is not noExpiry', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1 }] });
    expect(hasMissingExpiry(item)).toBeTrue();
  });

  it('is false when every dateless batch is marked noExpiry', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] });
    expect(hasMissingExpiry(item)).toBeFalse();
  });
});

describe('countMissingExpiryBatches', () => {
  it('is 0 for fresh items regardless of batch dates', () => {
    const item = makeItem({ productType: 'fresh', batches: [{ batchId: 'b1', quantity: 1 }] });
    expect(countMissingExpiryBatches(item)).toBe(0);
  });

  it('counts only the batches lacking a date and not marked noExpiry', () => {
    const item = makeItem({
      batches: [
        { batchId: 'b1', quantity: 1 },
        { batchId: 'b2', quantity: 1, expirationDate: '2026-02-01' },
        { batchId: 'b3', quantity: 1, noExpiry: true },
        { batchId: 'b4', quantity: 1 },
      ],
    });
    expect(countMissingExpiryBatches(item)).toBe(2);
  });

  it('is 0 when every dateless batch is marked noExpiry', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] });
    expect(countMissingExpiryBatches(item)).toBe(0);
  });
});

describe('statusFilterCount', () => {
  const summary = {
    total: 10,
    statusCounts: { expired: 1, expiring: 2, review: 3, lowStock: 4, normal: 5, pendientes: 6 },
  };

  it('maps every filter value to its own count', () => {
    expect(statusFilterCount(summary, 'all')).toBe(10);
    expect(statusFilterCount(summary, 'expired')).toBe(1);
    expect(statusFilterCount(summary, 'near-expiry')).toBe(2);
    expect(statusFilterCount(summary, 'review')).toBe(3);
    expect(statusFilterCount(summary, 'low-stock')).toBe(4);
    expect(statusFilterCount(summary, 'normal')).toBe(5);
    expect(statusFilterCount(summary, 'pendientes')).toBe(6);
  });
});

describe('isStatusChipVisible', () => {
  it('always shows "All" — it is the way back, even at zero', () => {
    expect(isStatusChipVisible('all', 0)).toBeTrue();
  });

  it('hides any other chip that would show nothing', () => {
    for (const value of ['expired', 'near-expiry', 'review', 'low-stock', 'normal', 'pendientes'] as const) {
      expect(isStatusChipVisible(value, 0)).withContext(value).toBeFalse();
    }
  });

  it('shows a chip as soon as it has something to show', () => {
    expect(isStatusChipVisible('expired', 1)).toBeTrue();
  });
});

describe('sortPantryItems', () => {
  const a = (name: string, expirationDate?: string) =>
    makeItem({ _id: name, name, expirationDate });

  it('alpha keeps the current alphabetical behaviour, ignoring accents and case', () => {
    const sorted = sortPantryItems([a('zanahoria'), a('Árbol'), a('berenjena')], 'alpha');
    expect(sorted.map(i => i.name)).toEqual(['Árbol', 'berenjena', 'zanahoria']);
  });

  it('expiry puts the earliest date first, so expired items lead', () => {
    const sorted = sortPantryItems(
      [a('leche', '2026-09-30'), a('yogur', '2026-09-01'), a('queso', '2026-09-15')],
      'expiry',
    );
    expect(sorted.map(i => i.name)).toEqual(['yogur', 'queso', 'leche']);
  });

  it('expiry sends dateless items to the end, alphabetically', () => {
    const sorted = sortPantryItems([a('sal'), a('arroz'), a('leche', '2026-09-30')], 'expiry');
    expect(sorted.map(i => i.name)).toEqual(['leche', 'arroz', 'sal']);
  });

  it('expiry breaks ties by name so the order never jumps between reloads', () => {
    const sorted = sortPantryItems([a('pan', '2026-09-20'), a('huevos', '2026-09-20')], 'expiry');
    expect(sorted.map(i => i.name)).toEqual(['huevos', 'pan']);
  });

  it('expiry compares parsed instants, so a legacy full ISO timestamp still orders correctly against a plain date', () => {
    const sorted = sortPantryItems(
      [a('leche', '2026-09-15T00:00:00Z'), a('yogur', '2026-09-01')],
      'expiry',
    );
    expect(sorted.map(i => i.name)).toEqual(['yogur', 'leche']);
  });

  it('does not mutate its input', () => {
    const input = [a('b'), a('a')];
    sortPantryItems(input, 'alpha');
    expect(input.map(i => i.name)).toEqual(['b', 'a']);
  });
});

describe('isPantrySortMode', () => {
  it('accepts only the known modes', () => {
    expect(isPantrySortMode('expiry')).toBeTrue();
    expect(isPantrySortMode('alpha')).toBeTrue();
    expect(isPantrySortMode('recent')).toBeFalse();
    expect(isPantrySortMode(null)).toBeFalse();
  });
});
