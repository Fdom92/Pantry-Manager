import { MeasurementUnit } from './enums.model';

export interface ItemLocationStock {
  locationId: string;
  quantity: number;
  unit: MeasurementUnit;
  minThreshold?: number;
  expiryDate?: string;
  opened?: boolean;
}
