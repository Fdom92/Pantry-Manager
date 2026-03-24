import type { PantryItem } from './item.model';

export interface ConsumeEntry {
  id: string;
  name: string;
  quantity: number;
  maxQuantity: number;
  item: PantryItem;
}
