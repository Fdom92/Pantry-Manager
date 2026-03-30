export type BatchIdGenerator = () => string;

export interface ItemBatch {
  batchId?: string;
  quantity: number;
  expirationDate?: string;
  /** true = user confirmed this batch intentionally has no expiry date */
  noExpiry?: boolean;
  opened?: boolean;
  locationId?: string;
}
