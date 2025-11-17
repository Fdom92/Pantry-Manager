import { PantryItem } from './item.model';
import { MeasurementUnit } from './enums.model';
import { ItemLocationStock } from './item-location-stock.model';
import { ItemBatch } from './item-batch.model';

export interface PantryGroup {
  key: string;
  name: string;
  items: PantryItem[];
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

export interface CategoryState {
  expanded: boolean;
}

export type BatchStatusState = 'normal' | 'near-expiry' | 'expired' | 'unknown';
export type ProductStatusState = 'normal' | 'near-expiry' | 'expired';

export interface BatchStatusMeta {
  label: string;
  icon: string;
  state: BatchStatusState;
  color: 'danger' | 'warning' | 'success' | 'medium';
}

export interface BatchEntryMeta {
  batch: ItemBatch;
  location: ItemLocationStock;
  locationLabel: string;
  locationUnit: MeasurementUnit | string | undefined;
  status: BatchStatusMeta;
}

export interface BatchSummaryMeta {
  total: number;
  sorted: BatchEntryMeta[];
}

export interface BatchCountsMeta {
  total: number;
  expired: number;
  nearExpiry: number;
  normal: number;
  unknown: number;
}

export interface PantryItemGlobalStatus {
  state: ProductStatusState;
  label: string;
  accentColor: string;
  chipColor: string;
  chipTextColor: string;
}

export interface PantryItemBatchViewModel {
  batch: ItemBatch;
  location: ItemLocationStock;
  locationLabel: string;
  status: BatchStatusMeta;
  formattedDate: string;
  quantityLabel: string;
  quantityValue: number;
  unitLabel: string;
  opened: boolean;
}

export interface PantryItemCardViewModel {
  item: PantryItem;
  globalStatus: PantryItemGlobalStatus;
  totalQuantity: number;
  totalQuantityLabel: string;
  unitLabel: string;
  totalBatches: number;
  totalBatchesLabel: string;
  earliestExpirationDate: string | null;
  formattedEarliestExpirationShort: string;
  formattedEarliestExpirationLong: string;
  batchCountsLabel: string;
  batchCounts: BatchCountsMeta;
  batches: PantryItemBatchViewModel[];
}

export type PantryVirtualEntry =
  | {
      kind: 'category';
      group: PantryGroup;
    }
  | {
      kind: 'item';
      groupKey: string;
      item: PantryItem;
    };
