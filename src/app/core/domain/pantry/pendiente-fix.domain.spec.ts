import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { applyPendienteFix } from './pendiente-fix.domain';

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

describe('applyPendienteFix', () => {
  it('sets foodType and leaves batches untouched when no date fix is given', () => {
    const item = makeItem({
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-02-01' }],
    });
    const result = applyPendienteFix(item, { foodType: FoodType.CARB });
    expect(result.foodType).toBe(FoodType.CARB);
    expect(result.batches).toEqual(item.batches);
  });

  it('applies the date only to batches missing a date and not noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [
        { batchId: 'b1', quantity: 1 },
        { batchId: 'b2', quantity: 1, expirationDate: '2026-02-01' },
        { batchId: 'b3', quantity: 1, noExpiry: true },
      ],
    });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result.batches[0].expirationDate).toBe('2026-03-15');
    expect(result.batches[1].expirationDate).toBe('2026-02-01');
    expect(result.batches[2].expirationDate).toBeUndefined();
    expect(result.batches[2].noExpiry).toBe(true);
  });

  it('applies noExpiry to dateless batches and clears any stale expirationDate', () => {
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [{ batchId: 'b1', quantity: 1 }],
    });
    const result = applyPendienteFix(item, { noExpiry: true });
    expect(result.batches[0].noExpiry).toBe(true);
    expect(result.batches[0].expirationDate).toBeUndefined();
  });

  it('keeps the existing foodType when no foodType fix is given', () => {
    const item = makeItem({ foodType: FoodType.FRUIT, batches: [] });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result.foodType).toBe(FoodType.FRUIT);
  });

  it('returns a new item object rather than mutating the input', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1 }] });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result).not.toBe(item);
    expect(item.batches[0].expirationDate).toBeUndefined();
  });
});
