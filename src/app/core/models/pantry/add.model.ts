import type { FoodType } from '../shared/enums.model';
import type { PantryItem } from './item.model';

export interface AddEntry {
  id: string;
  name: string;
  quantity: number;
  item?: PantryItem;
  isNew: boolean;
  expirationDate?: string;
  noExpiry?: boolean;
  /** Inferred from the name, or picked by the user in the add row. */
  foodType?: FoodType | null;
}
