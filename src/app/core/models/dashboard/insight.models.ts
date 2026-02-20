import type { AgentEntryContext } from '@core/models/agent';

export enum InsightId {
  COOK_BEFORE_EXPIRY = 'cook_before_expiry',
  WEEKLY_MEAL_PLANNING = 'weekly_meal_planning',
  SMART_COOKING_IDEAS = 'smart_cooking_ideas',
  PANTRY_HEALTHY = 'pantry_healthy',
  ADD_EXPIRY_DATES = 'add_expiry_dates',
  ORGANIZE_WITH_CATEGORIES = 'organize_with_categories',
  LOW_STOCK_REMINDER = 'low_stock_reminder',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
  HISTORY_UNLIMITED = 'history_unlimited',
  SMART_INSIGHTS = 'smart_insights',
}

export enum InsightCategory {
  CRITICAL = 'critical',
  PREVENTIVE = 'preventive',
  BEHAVIOR = 'behavior',
  OPTIMIZATION = 'optimization',
}

export type InsightAudience = 'all' | 'pro' | 'non-pro';
export type InsightTranslationParamsBuilder = (context: InsightContext, helpers: InsightPredicateHelpers) => Record<string, unknown>;
export type InsightPredicate = (context: InsightContext, helpers: InsightPredicateHelpers) => boolean;
export type InsightCta =
  | {
      id: string;
      label: string;
      type: 'agent';
      entryContext: AgentEntryContext;
      prompt: string;
    }
  | {
      id: string;
      label: string;
      type: 'navigate';
      route: string;
    };
export type InsightCtaDefinition =
  | {
      id: string;
      labelKey: string;
      type: 'agent';
      entryContext: AgentEntryContext;
      promptKey: string;
    }
  | {
      id: string;
      labelKey: string;
      type: 'navigate';
      route: string;
    };
export interface Insight {
  id: InsightId;
  title: string;
  description: string;
  category: InsightCategory;
  ctas?: InsightCta[];
  priority: number;
  dismissLabel?: string;
}
export interface InsightDefinition {
  id: InsightId;
  titleKey: string;
  descriptionKey: string;
  category: InsightCategory;
  ctas?: InsightCtaDefinition[];
  priority: number;
  audience: InsightAudience;
  dismissLabelKey?: string;
  predicate?: InsightPredicate;
}
export interface InsightExpiringItem {
  id?: string;
  isLowStock: boolean;
  quantity: number;
}
export interface InsightExpiredItem {
  id?: string;
}
export interface InsightProductSummary {
  id?: string;
  name: string;
  categoryId?: string | null;
}
export interface InsightContext {
  expiringSoonItems: InsightExpiringItem[];
  expiredItems: InsightExpiredItem[];
  expiringSoonCount: number;
  lowStockCount: number;
  products: InsightProductSummary[];
}
export interface InsightPredicateHelpers {
  now: Date;
}
