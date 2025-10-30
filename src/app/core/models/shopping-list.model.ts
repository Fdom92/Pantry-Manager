import { BaseDoc } from './base-doc.model';

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
