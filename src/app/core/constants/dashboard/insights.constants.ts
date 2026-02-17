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
  {
    id: InsightId.PLAN_AND_SAVE_TIME,
    titleKey: 'insights.library.planAndSaveTime.title',
    descriptionKey: 'insights.library.planAndSaveTime.description',
    category: InsightCategory.OPTIMIZATION,
    priority: 4,
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
    priority: 5,
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
    priority: 6,
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
