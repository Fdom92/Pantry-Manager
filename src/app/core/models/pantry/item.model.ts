import type { BaseDoc } from '../shared/base-doc.model';
import type { ExpirationStatus } from '../shared/enums.model';
import { ItemLocationStock } from './item-location-stock.model';

export interface PantryItem extends BaseDoc {
  type: 'item';
  householdId: string;
  name: string;
  brand?: string;
  categoryId: string;
  supermarket?: string;
  barcode?: string;
  locations: ItemLocationStock[];
  isBasic?: boolean;
  minThreshold?: number;
  noExpiry?: boolean;
  expirationDate?: string;
  expirationStatus?: ExpirationStatus;
}
