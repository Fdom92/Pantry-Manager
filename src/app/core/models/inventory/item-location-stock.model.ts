import { ItemBatch } from './item-batch.model';

export interface ItemLocationStock {
  locationId: string;
  unit: string;
  batches?: ItemBatch[];
}

export type LegacyLocationStock = ItemLocationStock & { minThreshold?: number | null };
