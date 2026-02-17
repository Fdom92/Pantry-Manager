import type { PantryItem } from '../pantry';
import type { BaseDoc } from '../shared/base-doc.model';

export enum ShoppingReason {
  EMPTY = 'empty',
  BELOW_MIN = 'below-min',
}

export type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
export type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
export type ShoppingStateWithItem = ShoppingState<PantryItem>;

export interface ShoppingList extends BaseDoc {
  readonly type: 'shopping-list';
  name: string;
  items: ShoppingListItem[];
  supermarketId?: string;
}
export interface ShoppingListItem {
  itemId: string;
  quantity: number;
}
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
}
export interface ShoppingState<TItem = string> {
  suggestions: ShoppingSuggestion<TItem>[];
  groupedSuggestions: ShoppingSuggestionGroup<TItem>[];
  summary: ShoppingSummary;
  hasAlerts: boolean;
}
