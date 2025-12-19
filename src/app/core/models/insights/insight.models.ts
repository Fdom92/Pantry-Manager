export enum InsightId {
  EXPIRING_LOW_STOCK = 'expiring_low_stock',
  EXPIRED_WITH_STOCK = 'expired_with_stock',
  LOW_STOCK_NO_EXPIRY = 'low_stock_no_expiry',
  DUPLICATED_PRODUCTS = 'duplicated_products',
}

export type DashboardSectionTarget = 'expired' | 'expiring' | 'lowStock' | 'products';

export interface InsightAction {
  type: 'navigate';
  target: 'dashboard_section';
  payload: DashboardSectionTarget;
}

export type InsightSeverity = 'info' | 'warning' | 'danger';

export interface Insight {
  id: InsightId;
  title: string;
  description: string;
  severity: InsightSeverity;
  ctaLabel?: string;
  priority: number;
}

export interface DashboardExpiringItem {
  id?: string;
  isLowStock: boolean;
}

export interface DashboardExpiredItem {
  id?: string;
  quantity: number;
}

export interface DashboardProductSummary {
  id?: string;
  name: string;
  categoryId?: string | null;
}

export interface DashboardInsightContext {
  expiringSoonItems: DashboardExpiringItem[];
  expiredItems: DashboardExpiredItem[];
  expiringSoonCount: number;
  lowStockCount: number;
  products: DashboardProductSummary[];
}
