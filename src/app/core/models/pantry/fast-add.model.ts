import type { PantryItem } from './item.model';

export interface FastAddEntry {
  id: string;
  name: string;
  quantity: number;
  item?: PantryItem;
  isNew: boolean;
}
