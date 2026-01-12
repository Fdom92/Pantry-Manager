import { AgentEntryContext } from '@core/models/agent';
import { InsightDefinition, InsightId } from '@core/models/insights';

export const INSIGHTS_LIBRARY: InsightDefinition[] = [
  {
    id: InsightId.PENDING_PRODUCT_UPDATES,
    titleKey: 'insights.library.pendingProductUpdates.title',
    descriptionKey: 'insights.library.pendingProductUpdates.description',
    descriptionParams: context => ({
      count: context.pendingReviewProducts.length,
    }),
    severity: 'warning',
    priority: 0,
    audience: 'all',
    predicate: context => context.pendingReviewProducts.length > 0,
    dismissLabelKey: 'insights.library.pendingProductUpdates.dismiss',
    ctas: [
      {
        id: 'review-pantry-items',
        labelKey: 'insights.library.pendingProductUpdates.cta',
        type: 'navigate',
        route: '/up-to-date',
      },
    ],
  },
  {
    id: InsightId.WEEKLY_MEAL_PLANNING,
    titleKey: 'insights.library.weeklyMealPlanning.title',
    descriptionKey: 'insights.library.weeklyMealPlanning.description',
    severity: 'info',
    priority: 1,
    audience: 'pro',
    predicate: (_ctx, helpers) => isSundayAfternoon(helpers.now),
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
    id: InsightId.COOK_BEFORE_EXPIRY,
    titleKey: 'insights.library.cookBeforeExpiry.title',
    descriptionKey: 'insights.library.cookBeforeExpiry.description',
    severity: 'warning',
    priority: 2,
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
    id: InsightId.WHAT_TO_COOK_FOR_LUNCH,
    titleKey: 'insights.library.lunchIdeas.title',
    descriptionKey: 'insights.library.lunchIdeas.description',
    severity: 'info',
    priority: 3,
    audience: 'pro',
    predicate: (_ctx, helpers) => isWithinHours(helpers.now, 11, 15),
    ctas: [
      {
        id: 'ideas-lunch',
        labelKey: 'insights.library.lunchIdeas.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS,
        promptKey: 'insights.library.lunchIdeas.prompt',
      },
    ],
  },
  {
    id: InsightId.WHAT_TO_COOK_FOR_DINNER,
    titleKey: 'insights.library.dinnerIdeas.title',
    descriptionKey: 'insights.library.dinnerIdeas.description',
    severity: 'info',
    priority: 4,
    audience: 'pro',
    predicate: (_ctx, helpers) => isWithinHours(helpers.now, 18, 22),
    ctas: [
      {
        id: 'ideas-dinner',
        labelKey: 'insights.library.dinnerIdeas.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS,
        promptKey: 'insights.library.dinnerIdeas.prompt',
      },
    ],
  },
  {
    id: InsightId.WHAT_TO_COOK_NOW,
    titleKey: 'insights.library.whatToCookNow.title',
    descriptionKey: 'insights.library.whatToCookNow.description',
    severity: 'info',
    priority: 5,
    audience: 'pro',
    ctas: [
      {
        id: 'ideas-now',
        labelKey: 'insights.library.whatToCookNow.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS,
        promptKey: 'insights.library.whatToCookNow.prompt',
      },
    ],
  },
  {
    id: InsightId.PLAN_AND_SAVE_TIME,
    titleKey: 'insights.library.planAndSaveTime.title',
    descriptionKey: 'insights.library.planAndSaveTime.description',
    severity: 'info',
    priority: 6,
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
];

function isWithinHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  return hour >= startHour && hour < endHour;
}

function isSundayAfternoon(date: Date): boolean {
  return date.getDay() === 0 && date.getHours() >= 15;
}
