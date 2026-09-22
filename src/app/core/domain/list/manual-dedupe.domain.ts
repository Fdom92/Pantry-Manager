import { normalizeProductKey } from '@core/utils/normalization.util';

/**
 * A manual entry that names a product the list already suggests is the same
 * purchase written twice. The suggestion wins — it is tied to the product and
 * carries the quantity to restock. Matching uses normalizeProductKey, the same
 * rule markManualAsBought uses to find the pantry product.
 */
export function manualItemsNotSuggested<T extends { name: string }>(
  manuals: readonly T[],
  suggestedNames: readonly string[],
): T[] {
  const suggestedKeys = new Set(suggestedNames.map(normalizeProductKey));
  return manuals.filter(manual => !suggestedKeys.has(normalizeProductKey(manual.name)));
}
