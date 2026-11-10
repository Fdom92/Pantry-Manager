export type BatchIdGenerator = () => string;

export interface ItemBatch {
  batchId?: string;
  quantity: number;
  expirationDate?: string;
  /** true = user confirmed this batch intentionally has no expiry date */
  noExpiry?: boolean;
  opened?: boolean;
  /** ISO time it was opened; with `printedExpirationDate`, lets "open" be undone. */
  openedAt?: string;
  /** The date on the pack, kept when opening shortens `expirationDate`. */
  printedExpirationDate?: string;
  /** ISO time it went into the freezer. Its presence is what makes the lot frozen. */
  frozenAt?: string;
  /** Days of life the lot had when frozen; its date is removed while frozen. */
  frozenDaysLeft?: number;
  locationId?: string;
}
