import { MeasurementUnit, StockStatus } from "./enums.model";

export interface StockInfo {
  quantity: number;
  unit: MeasurementUnit;
  minThreshold?: number;
  maxThreshold?: number;
  isBasic?: boolean;
  status?: StockStatus;
}
