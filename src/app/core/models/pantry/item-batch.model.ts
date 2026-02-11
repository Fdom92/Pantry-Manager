export type BatchIdGenerator = () => string;

export interface ItemBatch {
  batchId?: string;
  quantity: number;
  expirationDate?: string;
  opened?: boolean;
  locationId?: string;
}
