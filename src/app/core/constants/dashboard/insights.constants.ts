import { AgentEntryContext } from '@core/models/planner';
import { InsightCategory, InsightDefinition, InsightId } from '@core/models/dashboard';

/** @deprecated Import from @core/constants/shared instead */
export { PENDING_REVIEW_STALE_DAYS } from '../shared/shared.constants';

// Insights focus on data quality improvement and PRO premium value.
// Urgency (expired, near-expiry, low stock) is handled by the actions layer.
export const INSIGHTS_LIBRARY: readonly InsightDefinition[] = [
  // PRO premium: AI-powered recipe suggestion for expiring items
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
  // Data quality: nudge to add expiry dates (only shown when relevant)
  {
    id: InsightId.ADD_EXPIRY_DATES,
    titleKey: 'insights.library.addExpiryDates.title',
    descriptionKey: 'insights.library.addExpiryDates.description',
    category: InsightCategory.BEHAVIOR,
    priority: 2,
    audience: 'all',
    predicate: context => context.noExpiryDateCount > 0,
    ctas: [
      {
        id: 'add-expiry-dates',
        labelKey: 'insights.library.addExpiryDates.cta',
        type: 'navigate',
        route: '/pantry',
      },
    ],
  },
  // Data quality: nudge to organize by category
  {
    id: InsightId.ORGANIZE_WITH_CATEGORIES,
    titleKey: 'insights.library.organizeWithCategories.title',
    descriptionKey: 'insights.library.organizeWithCategories.description',
    category: InsightCategory.OPTIMIZATION,
    priority: 3,
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
  // Conversion: single upsell for non-pro users
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
] as const;
