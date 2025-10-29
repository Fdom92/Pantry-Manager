import { BaseDoc } from './base-doc.model';

export interface Item extends BaseDoc {
  type: 'item';
  householdId: string;
  name: string;
  quantity: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'u';
  status: 'available' | 'low' | 'expired';
  expirationDate?: string;
  categoryId?: string;
  locationId?: string;
  supermarketId?: string;
}
