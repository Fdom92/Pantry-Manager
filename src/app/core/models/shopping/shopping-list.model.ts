import type { PantryItem } from '../pantry';
import type { BaseDoc } from '../shared/base-doc.model';

// ENUMS
export enum ShoppingReasonEnum {
  EMPTY = 'empty',
  BELOW_MIN = 'below-min',
}
// TYPES
export type ShoppingReason = 'below-min' | 'empty';
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
  unit: string;
  checked: boolean;
}
export interface ShoppingSuggestion<TItem = string> {
  item: TItem;
  locationId: string;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
  unit: string;
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
export interface ShoppingItem {
  id?: string;
  productId?: string;
  quantity?: number;
  suggestedQuantity?: number;
  locationId?: string;
}
