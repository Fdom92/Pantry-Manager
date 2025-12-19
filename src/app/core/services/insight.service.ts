import { Injectable } from '@angular/core';
import {
  Insight,
  InsightCTAAction,
  InsightEvaluationContext,
  InsightType,
  PantryItem,
} from '@core/models';

const RECIPE_SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes since the last generation.
const NON_RECIPE_CATEGORY_HINTS = ['clean', 'limp', 'hogar', 'bath', 'aseo', 'pet', 'mascota'];

@Injectable({ providedIn: 'root' })
export class InsightService {
  evaluateInsights(context: InsightEvaluationContext): Insight | null {
    // Generate every possible insight using the current context.
    const candidates = [
      this.buildExpiringSoonInsight(context),
      this.buildCookNowInsight(context),
      this.buildOutOfStockInsight(context),
      this.buildLowStockInsight(context),
      this.buildShoppingReminderInsight(context),
    ].filter((insight): insight is Insight => Boolean(insight));

    if (!candidates.length) {
      return null;
    }

    // Lower priority value means higher importance.
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0];
  }

  private buildExpiringSoonInsight(context: InsightEvaluationContext): Insight | null {
    if (!this.isDashboardView(context) || !context.expiringSoon.length) {
      return null;
    }

    const summary = this.describeProducts(context.expiringSoon);

    return this.createInsight({
      type: InsightType.EXPIRING_SOON,
      title: 'Productos a punto de caducar',
      description: `${summary} caduca pronto. Revísalos antes de que sea tarde.`,
      ctaLabel: 'Ver productos',
      ctaAction: InsightCTAAction.VIEW_EXPIRING_PRODUCTS,
      priority: 1,
      blocking: true,
      context: { count: context.expiringSoon.length },
    });
  }

  private buildCookNowInsight(context: InsightEvaluationContext): Insight | null {
    // Requires at least two critical products and no recent recipe generation.
    if (context.expiringSoon.length < 2) {
      return null;
    }
    if (this.hasRecentRecipeGeneration(context.lastRecipeGeneratedAt)) {
      return null;
    }

    const recipeCandidates = context.expiringSoon.filter(item => this.isRecipeCompatible(item));
    if (recipeCandidates.length < 2) {
      return null;
    }

    const summary = this.describeProducts(recipeCandidates);
    return this.createInsight({
      type: InsightType.COOK_NOW,
      title: 'Aprovecha los ingredientes',
      description: `${summary} están listos para usarse en una receta hoy.`,
      ctaLabel: 'Ver recetas',
      ctaAction: InsightCTAAction.VIEW_RECIPES,
      priority: 2,
      blocking: true,
      context: { items: recipeCandidates.slice(0, 5).map(item => item._id) },
    });
  }

  private buildOutOfStockInsight(context: InsightEvaluationContext): Insight | null {
    // Only applies on Dashboard and while the user is outside the shopping view.
    if (!this.isDashboardView(context) || !context.outOfStock.length || this.isShoppingView(context)) {
      return null;
    }

    const summary = this.describeProducts(context.outOfStock);
    return this.createInsight({
      type: InsightType.OUT_OF_STOCK,
      title: 'Productos agotados',
      description: `${summary} se quedó sin stock. Actualiza la lista de compra para reponerlos.`,
      ctaLabel: 'Revisar compra',
      ctaAction: InsightCTAAction.REVIEW_SHOPPING,
      priority: 3,
      blocking: false,
      context: { count: context.outOfStock.length },
    });
  }

  private buildLowStockInsight(context: InsightEvaluationContext): Insight | null {
    // Avoids competing with OUT_OF_STOCK and skips products already in the shopping list.
    if (!context.lowStock.length || context.outOfStock.length) {
      return null;
    }

    const pendingLowStock = context.lowStock.filter(item => !this.isItemInShoppingList(item, context.shoppingList));
    if (!pendingLowStock.length) {
      return null;
    }

    const summary = this.describeProducts(pendingLowStock);
    return this.createInsight({
      type: InsightType.LOW_STOCK,
      title: 'Reponer antes de que falte',
      description: `${summary} tiene stock limitado. Añádelos a tu lista de compra.`,
      ctaLabel: 'Añadir a compra',
      ctaAction: InsightCTAAction.ADD_TO_SHOPPING,
      priority: 4,
      blocking: false,
      context: { count: pendingLowStock.length },
    });
  }

  private buildShoppingReminderInsight(context: InsightEvaluationContext): Insight | null {
    // Light reminder when there is a pending shopping list and the user is on Dashboard.
    if (
      !this.isDashboardView(context) ||
      !context.shoppingList.length ||
      this.isShoppingView(context)
    ) {
      return null;
    }

    const summary = this.describeProducts(context.shoppingList);
    return this.createInsight({
      type: InsightType.SHOPPING_REMINDER,
      title: 'Compra pendiente',
      description: `${summary} espera en la lista de compra. Revísala antes de salir.`,
      ctaLabel: 'Ver lista',
      ctaAction: InsightCTAAction.VIEW_SHOPPING_LIST,
      priority: 5,
      blocking: false,
      context: { count: context.shoppingList.length },
    });
  }

  private hasRecentRecipeGeneration(lastRecipeGeneratedAt?: string | number | Date): boolean {
    if (!lastRecipeGeneratedAt) {
      return false;
    }
    const last = new Date(lastRecipeGeneratedAt).getTime();
    if (Number.isNaN(last)) {
      return false;
    }
    return Date.now() - last < RECIPE_SESSION_TTL_MS;
  }

  private isDashboardView(context: InsightEvaluationContext): boolean {
    return (context.currentView ?? '').toLowerCase() === 'dashboard'.toLowerCase();
  }

  private isShoppingView(context: InsightEvaluationContext): boolean {
    return (context.currentView ?? '').toLowerCase() === 'compra'.toLowerCase();
  }

  private isItemInShoppingList(target: PantryItem, shoppingList: PantryItem[]): boolean {
    if (!target?._id) {
      return false;
    }
    return shoppingList.some(item => item?._id === target._id);
  }

  private describeProducts(items: PantryItem[]): string {
    if (!items.length) {
      return 'Los productos';
    }
    const [first, second] = items;
    if (items.length === 1) {
      return first?.name ?? 'Este producto';
    }
    if (items.length === 2) {
      return `${first?.name ?? 'Un producto'} y ${second?.name ?? 'otro producto'}`;
    }
    const remaining = items.length - 1;
    return `${first?.name ?? 'Un producto'} y ${remaining} ${remaining === 1 ? 'producto más' : 'productos más'}`;
  }

  private isRecipeCompatible(item: PantryItem): boolean {
    const category = (item.categoryId ?? '').toLowerCase();
    if (!category) {
      return true;
    }
    return !NON_RECIPE_CATEGORY_HINTS.some(disallowed => category.includes(disallowed));
  }

  private createInsight(partial: Omit<Insight, 'id' | 'createdAt'>): Insight {
    return {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }
}
