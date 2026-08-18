import { FoodType } from '@core/models/shared/enums.model';
import { hasMissingExpiry, isIncomplete, matchesFilters } from './pantry-filtering.domain';
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
