export interface ItemBatch {
  batchId?: string;
  quantity: number;
  unit?: string;
  expirationDate?: string;
  opened?: boolean;
  locationId?: string;
}
