import { MeasurementUnit } from './enums.model';

export interface ItemBatch {
  batchId?: string;
  quantity: number;
  unit?: MeasurementUnit;
  entryDate?: string;
  expirationDate?: string;
  opened?: boolean;
}
