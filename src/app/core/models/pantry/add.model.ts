import type { PantryItem } from './item.model';

export interface AddEntry {
  id: string;
  name: string;
  quantity: number;
  item?: PantryItem;
  isNew: boolean;
  expirationDate?: string;
  noExpiry?: boolean;
}
