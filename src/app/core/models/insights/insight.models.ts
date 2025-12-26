import { AgentEntryContext } from '@core/models/agent';

export enum InsightId {
  WEEKLY_MEAL_PLANNING = 'weekly_meal_planning',
  COOK_BEFORE_EXPIRY = 'cook_before_expiry',
  WHAT_TO_COOK_NOW = 'what_to_cook_now',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
  WHAT_TO_COOK_FOR_LUNCH = 'what_to_cook_for_lunch',
  WHAT_TO_COOK_FOR_DINNER = 'what_to_cook_for_dinner',
}

export type InsightSeverity = 'info' | 'warning' | 'danger';

export type InsightAudience = 'all' | 'pro' | 'non-pro';

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

export interface Insight {
  id: InsightId;
  title: string;
  description: string;
  severity: InsightSeverity;
  ctas?: InsightCta[];
  priority: number;
}

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

export interface InsightDefinition {
  id: InsightId;
  titleKey: string;
  descriptionKey: string;
  severity: InsightSeverity;
  ctas?: InsightCtaDefinition[];
  priority: number;
  audience: InsightAudience;
  predicate?: InsightPredicate;
}

export interface InsightExpiringItem {
  id?: string;
  isLowStock: boolean;
  quantity: number;
}

export interface InsightExpiredItem {
  id?: string;
  quantity: number;
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

export type InsightPredicate = (context: InsightContext, helpers: InsightPredicateHelpers) => boolean;

export interface InsightPredicateHelpers {
  now: Date;
}
