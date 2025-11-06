import { ItemBatch } from './item-batch.model';

export interface ItemLocationStock {
  locationId: string;
  unit: string;
  minThreshold?: number;
  batches?: ItemBatch[];
}
