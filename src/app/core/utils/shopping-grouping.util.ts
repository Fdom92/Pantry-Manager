import { UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';
import type { ShoppingSuggestionGroupWithItem, ShoppingSuggestionWithItem } from '@core/models/shopping';
import { normalizeLowercase } from './normalization.util';

export function groupSuggestionsBySupermarket(params: {
  suggestions: ShoppingSuggestionWithItem[];
  labelForUnassigned: string;
}): ShoppingSuggestionGroupWithItem[] {
  const map = new Map<string, ShoppingSuggestionWithItem[]>();
  for (const suggestion of params.suggestions) {
    const key = normalizeLowercase(suggestion.supermarket) || UNASSIGNED_SUPERMARKET_KEY;
    const list = map.get(key);
    if (list) {
      list.push(suggestion);
    } else {
      map.set(key, [suggestion]);
    }
  }

  const groups = Array.from(map.entries()).map(([key, list]) => {
    const label =
      key === UNASSIGNED_SUPERMARKET_KEY
        ? params.labelForUnassigned
        : list[0]?.supermarket ?? params.labelForUnassigned;
    return { key, label, suggestions: list };
  });

  return groups.sort((a, b) => {
    if (a.key === UNASSIGNED_SUPERMARKET_KEY) {
      return 1;
    }
    if (b.key === UNASSIGNED_SUPERMARKET_KEY) {
      return -1;
    }
    return a.label.localeCompare(b.label);
  });
}
