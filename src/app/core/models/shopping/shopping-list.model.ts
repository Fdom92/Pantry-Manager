import type { PantryItem } from '../pantry';
import type { BaseDoc } from '../shared/base-doc.model';

// ENUMS
export enum ShoppingReason {
  EMPTY = 'empty',
  BELOW_MIN = 'below-min',
}
// TYPES
export type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
export type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
export type ShoppingStateWithItem = ShoppingState<PantryItem>;
// INTERFACES
export interface ShoppingList extends BaseDoc {
  type: 'shopping-list';
  name: string;
  createdBy: string;
  items: ShoppingListItem[];
  completed: boolean;
  supermarketId?: string;
}
export interface ShoppingListItem {
  itemId: string;
  quantity: number;
  checked: boolean;
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
