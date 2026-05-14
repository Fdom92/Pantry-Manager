import { FoodType } from '@core/models/shared/enums.model';
import { getExpiryModeFromFoodType, getItemStatusState } from './pantry-status.domain';
import type { PantryItem } from '@core/models/pantry';

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

function makeBatch(expirationDate: string, quantity = 1) {
  return { batchId: 'b1', quantity, expirationDate };
}

describe('getExpiryModeFromFoodType', () => {
  it('returns flexible for dairy', () => {
    expect(getExpiryModeFromFoodType(FoodType.DAIRY)).toBe('flexible');
  });

  it('returns flexible for carb', () => {
    expect(getExpiryModeFromFoodType(FoodType.CARB)).toBe('flexible');
  });

  it('returns ignore for household', () => {
    expect(getExpiryModeFromFoodType(FoodType.HOUSEHOLD)).toBe('ignore');
  });

  it('returns strict for protein', () => {
    expect(getExpiryModeFromFoodType(FoodType.PROTEIN)).toBe('strict');
  });

  it('returns strict for vegetable', () => {
    expect(getExpiryModeFromFoodType(FoodType.VEGETABLE)).toBe('strict');
  });

  it('returns strict for fruit', () => {
    expect(getExpiryModeFromFoodType(FoodType.FRUIT)).toBe('strict');
  });

  it('returns strict for other', () => {
    expect(getExpiryModeFromFoodType(FoodType.OTHER)).toBe('strict');
  });

  it('returns strict for undefined (safe fallback)', () => {
    expect(getExpiryModeFromFoodType(undefined)).toBe('strict');
  });
});

describe('getItemStatusState — review behavior', () => {
  const windowDays = 15;

  it('returns review for dairy item expired 3 days ago', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11'; // 3 days ago
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('review');
  });

  it('returns review for carb item expired 7 days ago (boundary)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-07'; // exactly 7 days ago
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('review');
  });

  it('returns expired for dairy item expired 8 days ago (past grace)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-06'; // 8 days ago
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns expired immediately for protein item', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-13'; // 1 day ago
    const item = makeItem({
      foodType: FoodType.PROTEIN,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns expired immediately for item without foodType', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11';
    const item = makeItem({
      foodType: undefined,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns normal for household item past expiry date', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-01'; // far past
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('normal');
  });

  it('does NOT return review for fresh items (fresh ignores flexible logic)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11'; // 3 days ago
    const item = makeItem({
      productType: 'fresh',
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });
});
