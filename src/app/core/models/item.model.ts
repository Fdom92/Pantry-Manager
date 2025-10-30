import { BaseDoc } from './base-doc.model';
import { ExpirationStatus } from './enums.model';
import { StockInfo } from './stock-info.model';

export interface PantryItem extends BaseDoc {
  type: 'item';
  householdId: string;
  name: string;
  brand?: string;
  categoryId: string;
  locationId: string;
  supermarketId?: string;
  barcode?: string;
  stock: StockInfo | null;
  expirationDate?: string;
  expirationStatus?: ExpirationStatus;
}
