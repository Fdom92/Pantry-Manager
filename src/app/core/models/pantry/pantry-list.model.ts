import { ItemBatch } from './item-batch.model';
import { PantryItem } from './item.model';

export type PantryStatusFilterValue = 'all' | 'expired' | 'near-expiry' | 'low-stock' | 'normal';
export type ExpiryClassification = 'expired' | 'near-expiry' | 'normal' | 'unknown';
export type FilterChipKind = 'status' | 'basic';

export interface FilterChipViewModel {
  key: string;
  kind: FilterChipKind;
  value?: PantryStatusFilterValue;
  label: string;
  count: number;
  icon: string;
  description: string;
  colorClass: string;
  active: boolean;
}

export interface PantrySummaryMeta {
  total: number;
  visible: number;
  basicCount: number;
  statusCounts: {
    expired: number;
    expiring: number;
    lowStock: number;
    normal: number;
  };
}

export interface PantryGroup {
  key: string;
  name: string;
  items: PantryItem[];
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

export type BatchStatusState = 'normal' | 'near-expiry' | 'expired' | 'unknown';
export type ProductStatusState = 'normal' | 'near-expiry' | 'expired' | 'low-stock';

export interface BatchStatusMeta {
  label: string;
  icon: string;
  state: BatchStatusState;
  color: 'danger' | 'warning' | 'success' | 'medium';
}

export interface BatchEntryMeta {
  batch: ItemBatch;
  locationId: string;
  locationLabel: string;
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
  locationId: string;
  locationLabel: string;
  hasLocation: boolean;
  status: BatchStatusMeta;
  formattedDate: string;
  quantityLabel: string;
  quantityValue: number;
  opened: boolean;
}

export interface PantryItemCardViewModel {
  item: PantryItem;
  globalStatus: PantryItemGlobalStatus;
  colorClass: string;
  totalQuantity: number;
  totalQuantityLabel: string;
  totalBatches: number;
  totalBatchesLabel: string;
  earliestExpirationDate: string | null;
  formattedEarliestExpirationLong: string;
  batchCountsLabel: string;
  batchCounts: BatchCountsMeta;
  batches: PantryItemBatchViewModel[];
}

export interface MoveBatchesResult {
  moved: ItemBatch[];
  remaining: ItemBatch[];
}

export type PantrySummary = Readonly<{
  total: number;
  expired: number;
  nearExpiry: number;
  lowStock: number;
}>;
