import type { PantryItem } from '@core/models/pantry';
import { ShoppingReason } from '@core/models/list';
import { buildShoppingAnalysis } from './shopping-analysis.domain';

function item(over: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: over._id ?? 'item:leche',
    type: 'item',
    name: over.name ?? 'Leche',
    productType: over.productType ?? 'pantry',
    categoryId: '',
    isBasic: over.isBasic ?? true,
    minThreshold: over.minThreshold ?? 2,
    batches: over.batches ?? [{ batchId: 'b1', quantity: 0 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PantryItem;
}

function analyse(items: PantryItem[], over: Partial<Parameters<typeof buildShoppingAnalysis>[0]> = {}) {
  return buildShoppingAnalysis({
    items,
    boughtIds: new Set<string>(),
    removedIds: new Set<string>(),
    boughtManuals: [],
    unassignedLabel: 'Sin supermercado',
    ...over,
  });
}

describe('buildShoppingAnalysis', () => {
  it('suggests a basic product that has run out', () => {
    const state = analyse([item()]);

    expect(state.suggestions.length).toBe(1);
    expect(state.suggestions[0].item.name).toBe('Leche');
    expect(state.summary.total).toBe(1);
  });

  it('leaves alone a product that is not marked basic', () => {
    const state = analyse([item({ isBasic: false })]);

    expect(state.suggestions).toEqual([]);
    expect(state.summary.total).toBe(0);
  });

  it('leaves alone a product that is still above its threshold', () => {
    const state = analyse([item({ batches: [{ batchId: 'b1', quantity: 5 }] })]);

    expect(state.suggestions).toEqual([]);
  });

  it('adds up every batch before deciding', () => {
    const state = analyse([item({
      minThreshold: 3,
      batches: [{ batchId: 'b1', quantity: 1 }, { batchId: 'b2', quantity: 1 }],
    })]);

    expect(state.suggestions.length).toBe(1);
    expect(state.suggestions[0].currentQuantity).toBe(2);
  });

  /**
   * A product bought during this visit stays under "Comprado" even once the
   * restock puts it back above its threshold, so the list the user just cleared
   * does not refill itself in front of them.
   */
  describe('what the visit has already dealt with', () => {
    it('keeps a bought product out of the suggestions and in the bought list', () => {
      const state = analyse([item()], { boughtIds: new Set(['item:leche']) });

      expect(state.suggestions).toEqual([]);
      expect(state.allBoughtItems.map(b => b.id)).toEqual(['item:leche']);
    });

    it('keeps it under Comprado even after it was restocked past its threshold', () => {
      const restocked = item({ batches: [{ batchId: 'b1', quantity: 10 }] });

      const state = analyse([restocked], { boughtIds: new Set(['item:leche']) });

      expect(state.allBoughtItems.map(b => b.id)).toEqual(['item:leche']);
      expect(state.suggestions).toEqual([]);
    });

    it('moves an ignored product to the hidden list instead of suggesting it', () => {
      const state = analyse([item()], { removedIds: new Set(['item:leche']) });

      expect(state.suggestions).toEqual([]);
      expect(state.allIgnoredItems.map(b => b.id)).toEqual(['item:leche']);
    });

    it('counts manual entries already bought in the summary', () => {
      const state = analyse([], { boughtManuals: [{ id: 'm1', name: 'Pilas' }] });

      expect(state.summary.boughtCount).toBe(1);
      expect(state.allBoughtItems.map(b => b.name)).toEqual(['Pilas']);
    });
  });

  describe('grouping by supermarket', () => {
    it('counts distinct supermarkets, ignoring case', () => {
      const state = analyse([
        item({ _id: 'a', name: 'Leche', supermarket: 'Mercadona' }),
        item({ _id: 'b', name: 'Arroz', supermarket: 'mercadona' }),
        item({ _id: 'c', name: 'Pan', supermarket: 'Lidl' }),
      ]);

      expect(state.summary.supermarketCount).toBe(2);
    });

    it('files a product with no supermarket under the label it was given', () => {
      const state = analyse([item({ supermarket: undefined })]);

      expect(state.groupedSuggestions.some(g => g.label === 'Sin supermercado')).toBeTrue();
    });
  });

  it('orders each group by urgency, emptiest first', () => {
    const state = analyse([
      item({ _id: 'a', name: 'Arroz', supermarket: 'Lidl', minThreshold: 5, batches: [{ batchId: 'b1', quantity: 4 }] }),
      item({ _id: 'b', name: 'Leche', supermarket: 'Lidl', minThreshold: 2, batches: [{ batchId: 'b2', quantity: 0 }] }),
    ]);

    const lidl = state.groupedSuggestions.find(g => g.label === 'Lidl');
    expect(lidl?.suggestions[0].reason).toBe(ShoppingReason.EMPTY);
  });

  it('returns an empty analysis for an empty pantry', () => {
    const state = analyse([]);

    expect(state.suggestions).toEqual([]);
    expect(state.groupedSuggestions).toEqual([]);
    expect(state.summary.total).toBe(0);
    expect(state.summary.supermarketCount).toBe(0);
  });
});
