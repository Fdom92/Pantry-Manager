import type { ExpirySource } from '@core/domain/pantry';
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
  /** Food class key, set when the entry comes from a basic so the name's translation is not re-classified. */
  foodKind?: string;
  /**
   * True once the user has set the date themselves, which stops a later change
   * of food type from replacing it. A suggested date makes no such claim.
   */
  dateFromUser?: boolean;
  /** Who decided the date, for the hint under it and for analytics. */
  expirySource?: ExpirySource | 'user';
}
