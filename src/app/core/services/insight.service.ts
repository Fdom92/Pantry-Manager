import { Injectable, inject } from '@angular/core';
import {
  AgentEntryContext,
  DashboardInsightContext,
  Insight,
  InsightCta,
  InsightId,
  InsightSeverity,
} from '@core/models';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class InsightService {
  private readonly translate = inject(TranslateService);
  private readonly dismissedInsightIds = new Set<string>();

  buildDashboardInsights(context: DashboardInsightContext): Insight[] {
    const insights: Insight[] = [];

    const expiringLowStock = context.expiringSoonItems.filter(item => item.isLowStock);
    if (expiringLowStock.length >= 1) {
      insights.push({
        id: InsightId.EXPIRING_LOW_STOCK,
        title: this.translateKey('insights.expiringLowStock.title'),
        description: this.translateKey('insights.expiringLowStock.description'),
        ctaLabel: this.translateKey('insights.expiringLowStock.cta'),
        ctas: this.buildRecipeCtas('expiringLowStock'),
        severity: this.severity('warning'),
        priority: 2,
      });
    }

    const expiredWithStock = context.expiredItems.filter(item => item.quantity > 0);
    if (expiredWithStock.length >= 1) {
      insights.push({
        id: InsightId.EXPIRED_WITH_STOCK,
        title: this.translateKey('insights.expiredWithStock.title'),
        description: this.translateKey('insights.expiredWithStock.description'),
        ctaLabel: this.translateKey('insights.expiredWithStock.cta'),
        ctas: this.buildRecipeCtas('expiredWithStock'),
        severity: this.severity('danger'),
        priority: 1,
      });
    }

    if (context.expiringSoonCount === 0 && context.lowStockCount >= 3) {
      insights.push({
        id: InsightId.LOW_STOCK_NO_EXPIRY,
        title: this.translateKey('insights.lowStockNoExpiry.title'),
        description: this.translateKey('insights.lowStockNoExpiry.description'),
        ctaLabel: this.translateKey('insights.lowStockNoExpiry.cta'),
        severity: this.severity('info'),
        priority: 3,
      });
    }

    if (this.hasDuplicateProductNames(context.products)) {
      insights.push({
        id: InsightId.DUPLICATED_PRODUCTS,
        title: this.translateKey('insights.duplicatedProducts.title'),
        description: this.translateKey('insights.duplicatedProducts.description'),
        ctaLabel: this.translateKey('insights.duplicatedProducts.cta'),
        severity: this.severity('info'),
        priority: 4,
      });
    }

    return insights.sort((a, b) => a.priority - b.priority).slice(0, 2);
  }

  getVisibleInsights(insights: Insight[]): Insight[] {
    return insights.filter(insight => !this.dismissedInsightIds.has(insight.id));
  }

  dismiss(id: string): void {
    this.dismissedInsightIds.add(id);
  }

  resetSession(): void {
    this.dismissedInsightIds.clear();
  }

  private translateKey(key: string): string {
    return this.translate.instant(key);
  }

  private hasDuplicateProductNames(products: DashboardInsightContext['products']): boolean {
    const nameCounts = new Map<string, number>();
    for (const product of products) {
      const key = (product.name ?? '').trim().toLowerCase();
      if (!key) {
        continue;
      }
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    for (const count of nameCounts.values()) {
      if (count > 1) {
        return true;
      }
    }
    return false;
  }

  private severity(level: InsightSeverity): InsightSeverity {
    return level;
  }

  private buildRecipeCtas(type: 'expiringLowStock' | 'expiredWithStock'): InsightCta[] {
    const planPrompt = this.translateKey(`insights.${type}.planPrompt`);
    const ideasPrompt = this.translateKey(`insights.${type}.ideasPrompt`);
    const planCta: InsightCta | null = planPrompt
      ? {
          id: `${type}-plan`,
          label: this.translateKey('insights.ctaLabels.plan'),
          entryContext: AgentEntryContext.DASHBOARD_INSIGHT,
          prompt: planPrompt,
        }
      : null;
    const ideasCta: InsightCta | null = ideasPrompt
      ? {
          id: `${type}-ideas`,
          label: this.translateKey('insights.ctaLabels.ideas'),
          entryContext: AgentEntryContext.RECIPE_INSIGHT,
          prompt: ideasPrompt,
        }
      : null;
    return [planCta, ideasCta].filter((cta): cta is InsightCta => Boolean(cta?.prompt));
  }
}
