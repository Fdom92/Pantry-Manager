import { shouldAutoAddToShoppingList, sumQuantities } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import type {
  BoughtItem,
  ShoppingStateWithItem,
  ShoppingSuggestionWithItem,
  ShoppingSummary,
} from '@core/models/list';
import { groupSuggestionsBySupermarket } from '@core/utils/list-grouping.util';
import { roundQuantity } from '@core/utils/formatting.util';
import { normalizeLowercase, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { determineSuggestionNeed, incrementSummary, sortSuggestionsByUrgency } from './list.domain';

export interface ShoppingAnalysisInput {
  items: PantryItem[];
  /** Marked bought during this visit. */
  boughtIds: ReadonlySet<string>;
  /** Hidden during this visit with "no me hace falta". */
  removedIds: ReadonlySet<string>;
  /** Manual entries already bought, counted in the summary. */
  boughtManuals: BoughtItem[];
  /** Heading for products with no supermarket, resolved by the caller. */
  unassignedLabel: string;
}

/**
 * Turns the pantry into the shopping list: what is missing, grouped by
 * supermarket and ordered by urgency, plus what has already been dealt with
 * during this visit.
 */
export function buildShoppingAnalysis(input: ShoppingAnalysisInput): ShoppingStateWithItem {
  const { items, boughtIds, removedIds, boughtManuals, unassignedLabel } = input;

  const pendingSuggestions: ShoppingSuggestionWithItem[] = [];
  const boughtAutoItems: BoughtItem[] = [];
  const ignoredAutoItems: BoughtItem[] = [];
  const uniqueSupermarkets = new Set<string>();
  let summary: ShoppingSummary = {
    total: 0,
    belowMin: 0,
    empty: 0,
    supermarketCount: 0,
    boughtCount: 0,
  };

  for (const item of items) {
    const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
    const totalQuantity = sumQuantities(item.batches ?? []);
    const supermarket = normalizeSupermarketValue(item.supermarket);
    const id = item._id;

    // Bought is checked first on purpose: a product stays under "Comprado" for
    // the rest of the visit even once the restock puts it back above its
    // threshold, so it does not reappear on the list the user just cleared.
    if (boughtIds.has(id)) {
      boughtAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
      continue;
    }

    if (!shouldAutoAddToShoppingList(item, { totalQuantity, minThreshold })) {
      continue;
    }

    // Ignored products are kept so the "Ocultos ahora" section can show them.
    if (removedIds.has(id)) {
      ignoredAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
      continue;
    }

    const { reason, suggestedQuantity } = determineSuggestionNeed({
      totalQuantity,
      minThreshold,
      isFresh: item.productType === 'fresh',
    });

    if (reason) {
      if (supermarket) {
        uniqueSupermarkets.add(normalizeLowercase(supermarket));
      }
      pendingSuggestions.push({
        item,
        reason,
        suggestedQuantity,
        currentQuantity: roundQuantity(totalQuantity),
        minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
        supermarket: supermarket || undefined,
      });
      summary = incrementSummary(summary, reason);
    }
  }

  summary.total = pendingSuggestions.length;
  summary.supermarketCount = uniqueSupermarkets.size;
  summary.boughtCount = boughtAutoItems.length + boughtManuals.length;

  const groupedSuggestions = groupSuggestionsBySupermarket({
    suggestions: pendingSuggestions,
    labelForUnassigned: unassignedLabel,
  }).map(group => ({
    ...group,
    suggestions: sortSuggestionsByUrgency(group.suggestions),
  }));

  return {
    suggestions: pendingSuggestions,
    groupedSuggestions,
    summary,
    allBoughtItems: [...boughtAutoItems, ...boughtManuals],
    allIgnoredItems: ignoredAutoItems,
  };
}
