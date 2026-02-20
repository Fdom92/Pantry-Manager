import { AgentEntryContext } from '@core/models/agent';
import { InsightCategory, InsightDefinition, InsightId } from '@core/models/dashboard';
import { isWeekend, isWithinHours } from '@core/utils';

/** @deprecated Import from @core/constants/shared instead */
export { PENDING_REVIEW_STALE_DAYS } from '../shared/shared.constants';
export const INSIGHTS_LIBRARY: readonly InsightDefinition[] = [
  {
    id: InsightId.COOK_BEFORE_EXPIRY,
    titleKey: 'insights.library.cookBeforeExpiry.title',
    descriptionKey: 'insights.library.cookBeforeExpiry.description',
    category: InsightCategory.PREVENTIVE,
    priority: 1,
    audience: 'pro',
    predicate: context => context.expiringSoonItems.some(item => (item.quantity ?? 0) > 0),
    ctas: [
      {
        id: 'cook-before-expiry',
        labelKey: 'insights.library.cookBeforeExpiry.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS_RECIPES,
        promptKey: 'insights.library.cookBeforeExpiry.prompt',
      },
    ],
  },
  {
    id: InsightId.WEEKLY_MEAL_PLANNING,
    titleKey: 'insights.library.weeklyMealPlanning.title',
    descriptionKey: 'insights.library.weeklyMealPlanning.description',
    category: InsightCategory.PREVENTIVE,
    priority: 2,
    audience: 'pro',
    predicate: (_ctx, helpers) => isWeekend(helpers.now),
    ctas: [
      {
        id: 'weekly-meal-plan',
        labelKey: 'insights.library.weeklyMealPlanning.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS,
        promptKey: 'insights.library.weeklyMealPlanning.prompt',
      },
    ],
  },
  {
    id: InsightId.SMART_COOKING_IDEAS,
    titleKey: 'insights.library.smartCookingIdeas.title',
    descriptionKey: 'insights.library.smartCookingIdeas.description',
    category: InsightCategory.OPTIMIZATION,
    priority: 3,
    audience: 'pro',
    predicate: context => !context.expiringSoonItems.some(item => (item.quantity ?? 0) > 0),
    ctas: [
      {
        id: 'smart-cooking-ideas',
        labelKey: 'insights.library.smartCookingIdeas.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS,
        promptKey: 'insights.library.smartCookingIdeas.prompt',
      },
    ],
  },
  // Educational/tip insights visible to all users (teach app usage, no upgrade wall)
  {
    id: InsightId.PANTRY_HEALTHY,
    titleKey: 'insights.library.pantryHealthy.title',
    descriptionKey: 'insights.library.pantryHealthy.description',
    category: InsightCategory.PREVENTIVE,
    priority: 4,
    audience: 'all',
    predicate: context =>
      context.products.length > 0 &&
      context.expiringSoonCount === 0 &&
      context.expiredItems.length === 0 &&
      context.lowStockCount === 0,
    ctas: [
      {
        id: 'pantry-healthy',
        labelKey: 'insights.library.pantryHealthy.cta',
        type: 'navigate',
        route: '/shopping',
      },
    ],
  },
  {
    id: InsightId.ADD_EXPIRY_DATES,
    titleKey: 'insights.library.addExpiryDates.title',
    descriptionKey: 'insights.library.addExpiryDates.description',
    category: InsightCategory.BEHAVIOR,
    priority: 5,
    audience: 'all',
    ctas: [
      {
        id: 'add-expiry-dates',
        labelKey: 'insights.library.addExpiryDates.cta',
        type: 'navigate',
        route: '/pantry',
      },
    ],
  },
  {
    id: InsightId.LOW_STOCK_REMINDER,
    titleKey: 'insights.library.lowStockReminder.title',
    descriptionKey: 'insights.library.lowStockReminder.description',
    category: InsightCategory.CRITICAL,
    priority: 6,
    audience: 'all',
    predicate: context => context.lowStockCount > 0,
    ctas: [
      {
        id: 'low-stock-reminder',
        labelKey: 'insights.library.lowStockReminder.cta',
        type: 'navigate',
        route: '/shopping',
      },
    ],
  },
  {
    id: InsightId.ORGANIZE_WITH_CATEGORIES,
    titleKey: 'insights.library.organizeWithCategories.title',
    descriptionKey: 'insights.library.organizeWithCategories.description',
    category: InsightCategory.OPTIMIZATION,
    priority: 7,
    audience: 'all',
    predicate: context => context.products.some(p => !p.categoryId),
    ctas: [
      {
        id: 'organize-with-categories',
        labelKey: 'insights.library.organizeWithCategories.cta',
        type: 'navigate',
        route: '/pantry',
      },
    ],
  },
  // Non-pro upsell insights (fallback when no actionable insight applies)
  {
    id: InsightId.PLAN_AND_SAVE_TIME,
    titleKey: 'insights.library.planAndSaveTime.title',
    descriptionKey: 'insights.library.planAndSaveTime.description',
    category: InsightCategory.OPTIMIZATION,
    priority: 8,
    audience: 'non-pro',
    ctas: [
      {
        id: 'go-pro-upgrade',
        labelKey: 'insights.library.planAndSaveTime.cta',
        type: 'navigate',
        route: '/upgrade',
      },
    ],
  },
  {
    id: InsightId.HISTORY_UNLIMITED,
    titleKey: 'insights.library.historyUnlimited.title',
    descriptionKey: 'insights.library.historyUnlimited.description',
    category: InsightCategory.BEHAVIOR,
    priority: 9,
    audience: 'non-pro',
    ctas: [
      {
        id: 'history-unlimited-upgrade',
        labelKey: 'insights.library.historyUnlimited.cta',
        type: 'navigate',
        route: '/upgrade',
      },
    ],
  },
  {
    id: InsightId.SMART_INSIGHTS,
    titleKey: 'insights.library.smartInsights.title',
    descriptionKey: 'insights.library.smartInsights.description',
    category: InsightCategory.PREVENTIVE,
    priority: 10,
    audience: 'non-pro',
    predicate: context => context.expiringSoonItems.length > 0,
    ctas: [
      {
        id: 'smart-insights-upgrade',
        labelKey: 'insights.library.smartInsights.cta',
        type: 'navigate',
        route: '/upgrade',
      },
    ],
  },
] as const;
