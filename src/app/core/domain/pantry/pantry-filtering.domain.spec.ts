import { FoodType } from '@core/models/shared/enums.model';
import { matchesFilters } from './pantry-filtering.domain';
import type { PantryFilterState, PantryItem } from '@core/models/pantry';

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
};

describe('matchesFilters — review filter', () => {
  it('passes all items when review filter is false', () => {
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    expect(matchesFilters(item, { ...noFilters, review: false })).toBeTrue();
  });

  it('passes only review-state items when review filter is true', () => {
    const reviewItem = makeItem({
      foodType: FoodType.DAIRY,
      // 3 days expired from today 2026-05-14
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    const expiredItem = makeItem({
      foodType: FoodType.PROTEIN,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    expect(matchesFilters(reviewItem, { ...noFilters, review: true })).toBeTrue();
    expect(matchesFilters(expiredItem, { ...noFilters, review: true })).toBeFalse();
  });
});
