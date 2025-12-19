import { PantryItem } from '../inventory';

export enum InsightType {
  EXPIRING_SOON = 'expiring-soon',
  OUT_OF_STOCK = 'out-of-stock',
  LOW_STOCK = 'low-stock',
  COOK_NOW = 'cook-now',
  SHOPPING_REMINDER = 'shopping-reminder',
  NO_INSIGHT = 'no-insight',
}

export type InsightCTACallback = () => void;

export type InsightCTAHandler = InsightCTAAction | InsightCTACallback;

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: InsightCTAHandler;
  priority: number;
  blocking: boolean;
  createdAt: number;
  context?: Record<string, any>;
}

export enum InsightCTAAction {
  VIEW_EXPIRING_PRODUCTS = 'view-expiring-products',
  VIEW_RECIPES = 'view-recipes',
  REVIEW_SHOPPING = 'review-shopping',
  ADD_TO_SHOPPING = 'add-to-shopping',
  VIEW_SHOPPING_LIST = 'view-shopping-list',
}

export interface InsightActionEvent {
  action: InsightCTAHandler;
  insight: Insight;
}

export type InsightView = 'Dashboard' | 'Compra' | 'Despensa' | string;

export interface InsightEvaluationContext {
  products: PantryItem[];
  expiringSoon: PantryItem[];
  outOfStock: PantryItem[];
  lowStock: PantryItem[];
  shoppingList: PantryItem[];
  lastRecipeGeneratedAt?: string | number | Date;
  currentView: InsightView;
}
