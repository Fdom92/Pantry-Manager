import type { PantryItem } from '../pantry';

export enum ShoppingReason {
  EMPTY       = 'empty',
  BELOW_MIN   = 'below-min',
  FRESH_EMPTY = 'fresh-empty',
  MANUAL      = 'manual',
}

export interface BoughtItem {
  id: string;
  name: string;
  supermarket?: string;
}

export interface ManualItem {
  id: string;
  name: string;
}

export type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
export type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
export type ShoppingStateWithItem = ShoppingState<PantryItem>;

export interface ShoppingSuggestion<TItem = string> {
  item: TItem;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
  supermarket?: string;
}

export interface ShoppingSuggestionGroup<TItem = string> {
  key: string;
  label: string;
  suggestions: ShoppingSuggestion<TItem>[];
}

export interface ShoppingSummary {
  total: number;
  belowMin: number;
  empty: number;
  supermarketCount: number;
  boughtCount: number;
}

export interface ShoppingState<TItem = string> {
  suggestions: ShoppingSuggestion<TItem>[];
  groupedSuggestions: ShoppingSuggestionGroup<TItem>[];
  summary: ShoppingSummary;
  allBoughtItems: BoughtItem[];
  allIgnoredItems: BoughtItem[];
}
