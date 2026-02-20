import type { PantryItem } from '@core/models/pantry';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { formatQuantity } from './formatting.util';

export interface BuildItemAutocompleteOptions<TMeta = unknown> {
  locale: string;
  getQuantity?: (item: PantryItem) => number;
  getMeta?: (item: PantryItem, locale: string) => TMeta;
  excludeIds?: Set<string>;
}

/**
 * Build autocomplete options from pantry items with consistent formatting.
 */
export function buildPantryItemAutocomplete<TMeta = unknown>(
  items: PantryItem[],
  options: BuildItemAutocompleteOptions<TMeta>
): AutocompleteItem<PantryItem, TMeta>[] {
  const { locale, getQuantity, getMeta, excludeIds } = options;

  return (items ?? [])
    .filter(item => !excludeIds?.has(item._id))
    .map(item => {
      const quantity = getQuantity?.(item) ?? 0;
      const formattedQty = formatQuantity(quantity, locale);

      return {
        id: item._id,
        title: item.name,
        subtitle: formattedQty,
        meta: getMeta?.(item, locale),
        raw: item,
      };
    });
}
