import type { PantryItem } from '@core/models/pantry';

export interface ConsumeTodayEntry {
  itemId: string;
  title: string;
  quantity: number;
  maxQuantity: number;
  item: PantryItem;
}

export type DashboardOverviewCardId =
  | 'expired'
  | 'near-expiry'
  | 'pending-review'
  | 'low-or-empty'
  | 'recently-added'
  | 'shopping';
