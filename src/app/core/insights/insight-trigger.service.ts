import { Injectable } from '@angular/core';
import { ProService } from '@core/pro';
import { InsightService } from './insight.service';
import { buildDashboardInsights, buildProductAddedInsights } from './insight-library';
import { Insight, InsightTrigger } from './insight.types';

@Injectable({ providedIn: 'root' })
export class InsightTriggerService {
  constructor(
    private readonly insightService: InsightService,
    private readonly proService: ProService,
  ) {}

  trigger(trigger: InsightTrigger, context?: any): void {
    const insights = this.generateInsights(trigger, context);
    insights.forEach(insight => this.insightService.addInsight(insight));
  }

  private generateInsights(trigger: InsightTrigger, context?: any): Insight[] {
    switch (trigger) {
      case InsightTrigger.DASHBOARD:
        return buildDashboardInsights({ hasProAccess: this.proService.canUseProFeatures() });
      case InsightTrigger.PRODUCT_ADDED:
        return buildProductAddedInsights({ product: context });
      default:
        return [];
    }
  }
}
