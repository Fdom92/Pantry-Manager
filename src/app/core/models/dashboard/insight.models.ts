import type { BatchEditAction, BatchEditFilter } from '@core/models/pantry/batch-edit.model';
import type { FoodType } from '@core/models/shared/enums.model';

export enum InsightId {
  ADD_EXPIRY_DATES = 'add_expiry_dates',
  ORGANIZE_WITH_CATEGORIES = 'organize_with_categories',
  MISSING_FOODTYPE = 'missing_foodtype',
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
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      label: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
    };
export type InsightCtaDefinition =
  | {
      id: string;
      labelKey: string;
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      labelKey: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
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
  foodType?: FoodType | null;
}
export interface InsightContext {
  expiringSoonItems: InsightExpiringItem[];
  noExpiryDateCount: number;
  singleBatchNoExpiryCount: number;
  products: InsightProductSummary[];
}
export interface InsightPredicateHelpers {
  now: Date;
}
