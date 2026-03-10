import type { AgentEntryContext } from '@core/models/planner';

export enum InsightId {
  COOK_BEFORE_EXPIRY = 'cook_before_expiry',
  ADD_EXPIRY_DATES = 'add_expiry_dates',
  ORGANIZE_WITH_CATEGORIES = 'organize_with_categories',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
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
  quantity: number;
}
export interface InsightProductSummary {
  id?: string;
  name: string;
  categoryId?: string | null;
}
export interface InsightContext {
  expiringSoonItems: InsightExpiringItem[];
  noExpiryDateCount: number;
  products: InsightProductSummary[];
}
export interface InsightPredicateHelpers {
  now: Date;
}
