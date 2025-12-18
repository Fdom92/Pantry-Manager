import { BaseDoc } from './base-doc.model';
import { PantryItem } from './item.model';

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

export type ShoppingReason = 'below-min' | 'basic-low' | 'basic-out' | 'empty';

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
  basicLow: number;
  basicOut: number;
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

export type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
export type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
export type ShoppingStateWithItem = ShoppingState<PantryItem>;
