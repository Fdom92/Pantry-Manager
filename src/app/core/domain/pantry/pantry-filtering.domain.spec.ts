import { FoodType } from '@core/models/shared/enums.model';
import { matchesFilters } from './pantry-filtering.domain';
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
