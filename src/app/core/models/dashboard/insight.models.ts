import type { AgentEntryContext } from '@core/models/agent';

// ENUMS
export enum InsightId {
  WEEKLY_MEAL_PLANNING = 'weekly_meal_planning',
  COOK_BEFORE_EXPIRY = 'cook_before_expiry',
  WHAT_TO_COOK_NOW = 'what_to_cook_now',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
  WHAT_TO_COOK_FOR_LUNCH = 'what_to_cook_for_lunch',
  WHAT_TO_COOK_FOR_DINNER = 'what_to_cook_for_dinner',
}
// TYPES
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
// INTERFACES
export interface Insight {
  id: InsightId;
  title: string;
  description: string;
  ctas?: InsightCta[];
  priority: number;
  dismissLabel?: string;
}
export interface InsightDefinition {
  id: InsightId;
  titleKey: string;
  descriptionKey: string;
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
