import { MeasurementUnit } from './enums.model';

export interface ItemBatch {
  batchId?: string;
  quantity: number;
  unit?: MeasurementUnit;
  expirationDate?: string;
  opened?: boolean;
}
