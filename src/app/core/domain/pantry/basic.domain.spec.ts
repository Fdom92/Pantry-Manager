import type { PantryItem } from '@core/models/pantry';
import { setBasic } from './basic.domain';

const NOW = '2026-09-21T10:00:00.000Z';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'item:1', type: 'item', householdId: 'hh', name: 'Maíz', categoryId: 'cat',
    batches: [], isBasic: true, minThreshold: 2, createdAt: NOW, updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PantryItem;
}

describe('setBasic', () => {
  it('clears the minimum when a product stops being basic', () => {
    const result = setBasic(item(), false, NOW);
    expect(result.isBasic).toBeFalse();
    expect(result.minThreshold).toBeUndefined();
    expect(result.updatedAt).toBe(NOW);
  });

  it('keeps the current minimum when marking basic without a restore value', () => {
    const result = setBasic(item({ isBasic: false, minThreshold: 3 }), true, NOW);
    expect(result.isBasic).toBeTrue();
    expect(result.minThreshold).toBe(3);
  });

  it('restores a previous minimum when undoing', () => {
    const cleared = setBasic(item(), false, NOW);
    expect(setBasic(cleared, true, NOW, 2).minThreshold).toBe(2);
  });

  it('does not mutate its input', () => {
    const original = item();
    setBasic(original, false, NOW);
    expect(original.isBasic).toBeTrue();
    expect(original.minThreshold).toBe(2);
  });
});
