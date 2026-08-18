import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { applyPendienteFix, isPendienteRowResolved } from './pendiente-fix.domain';

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

describe('isPendienteRowResolved', () => {
  it('is resolved once a pre-filled (not user-picked) date satisfies the only missing dimension', () => {
    const row = {
      needsFoodType: false,
      needsDate: true,
      foodType: FoodType.CARB,
      expirationDate: '2026-05-15',
      noExpiry: false,
    };
    expect(isPendienteRowResolved(row)).toBeTrue();
  });

  it('is not resolved when foodType is still needed and unset', () => {
    const row = {
      needsFoodType: true,
      needsDate: true,
      foodType: null,
      expirationDate: undefined,
      noExpiry: false,
    };
    expect(isPendienteRowResolved(row)).toBeFalse();
  });

  it('is not resolved when a date is still needed and neither a date nor noExpiry is set', () => {
    const row = {
      needsFoodType: false,
      needsDate: true,
      foodType: FoodType.DAIRY,
      expirationDate: undefined,
      noExpiry: false,
    };
    expect(isPendienteRowResolved(row)).toBeFalse();
  });

  it('is resolved when the missing date dimension is satisfied via noExpiry instead of a date', () => {
    const row = {
      needsFoodType: false,
      needsDate: true,
      foodType: FoodType.HOUSEHOLD,
      expirationDate: undefined,
      noExpiry: true,
    };
    expect(isPendienteRowResolved(row)).toBeTrue();
  });

  it('is resolved when the row never needed a date at all (only foodType, now picked)', () => {
    const row = {
      needsFoodType: true,
      needsDate: false,
      foodType: FoodType.FRUIT,
      expirationDate: undefined,
      noExpiry: false,
    };
    expect(isPendienteRowResolved(row)).toBeTrue();
  });

  it('is resolved when a row needs both dimensions and both have been filled', () => {
    const row = {
      needsFoodType: true,
      needsDate: true,
      foodType: FoodType.PROTEIN,
      expirationDate: '2026-08-23',
      noExpiry: false,
    };
    expect(isPendienteRowResolved(row)).toBeTrue();
  });
});
