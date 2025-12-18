export enum InsightTrigger {
  APP_OPEN = 'app-open',
  DASHBOARD = 'dashboard',
  PRODUCT_ADDED = 'product-added',
  QUANTITY_CHANGED = 'quantity-changed',
  AFTER_AGENT_ACTION = 'after-agent-action',
}

export enum InsightType {
  WARNING = 'warning',
  SUGGESTION = 'suggestion',
  INFO = 'info',
  RECIPE = 'recipe',
}

export interface InsightCTA {
  label: string;
  action: 'open-agent' | 'run-agent' | 'navigate' | 'dismiss';
  payload?: any;
}

export interface Insight {
  id: string;
  type: InsightType;
  trigger: InsightTrigger;
  title: string;
  message: string;
  cta?: InsightCTA;
  proOnly?: boolean;
  createdAt: number;
}

export interface DashboardInsightContext {
  hasProAccess: boolean;
}

export interface ProductAddedInsightContext {
  product?: { name?: string } | null;
}
