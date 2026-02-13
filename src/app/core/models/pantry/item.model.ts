import type { BaseDoc } from '../shared/base-doc.model';
import type { ExpirationStatus } from '../shared/enums.model';
import { ItemBatch } from './item-batch.model';

export interface PantryItem extends BaseDoc {
  type: 'item';
  householdId: string;
  name: string;
  categoryId: string;
  supermarket?: string;
  batches: ItemBatch[];
  isBasic?: boolean;
  minThreshold?: number;
  noExpiry?: boolean;
  expirationDate?: string;
  expirationStatus?: ExpirationStatus;
}
