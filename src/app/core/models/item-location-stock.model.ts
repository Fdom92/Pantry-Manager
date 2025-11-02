import { MeasurementUnit } from './enums.model';
import { ItemBatch } from './item-batch.model';

export interface ItemLocationStock {
  locationId: string;
  unit: MeasurementUnit;
  minThreshold?: number;
  batches?: ItemBatch[];
}
