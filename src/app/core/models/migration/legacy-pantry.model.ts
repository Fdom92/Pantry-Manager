import type { BaseDoc } from '../shared/base-doc.model';
import type { ItemBatch } from '../pantry/item-batch.model';

export type LegacyItemBatch = Omit<ItemBatch, 'locationId'>;

export interface LegacyLocationStock {
  locationId?: string | null;
  unit?: string | null;
  batches?: LegacyItemBatch[];
  quantity?: number | null;
  minThreshold?: number | null;
}

export interface LegacyPantryItem extends BaseDoc {
  type: 'item';
  householdId?: string;
  name?: string;
  brand?: string;
  categoryId?: string;
  supermarket?: string;
  barcode?: string;
  locations?: LegacyLocationStock[];
  batches?: ItemBatch[];
  isBasic?: boolean;
  minThreshold?: number;
  noExpiry?: boolean;
}
