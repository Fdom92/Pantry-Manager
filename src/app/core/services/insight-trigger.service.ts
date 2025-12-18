import { inject, Injectable } from '@angular/core';
import { ProService } from '@core/services';
import { Insight, InsightTrigger } from '@core/models';
import { InsightService } from './insight.service';

@Injectable({ providedIn: 'root' })
export class InsightTriggerService {
  private readonly insightService = inject(InsightService);
  private readonly proService = inject(ProService);

  trigger(trigger: InsightTrigger, context?: any): void {
    const insights = this.generateInsights(trigger, context);
    insights.forEach(insight => this.insightService.addInsight(insight));
  }

  private generateInsights(trigger: InsightTrigger, context?: any): Insight[] {
    switch (trigger) {
      case InsightTrigger.DASHBOARD:
        return this.insightService.buildDashboardInsights({ hasProAccess: this.proService.canUseProFeatures() });
      case InsightTrigger.PRODUCT_ADDED:
        return this.insightService.buildProductAddedInsights({ product: context });
      default:
        return [];
    }
  }
}
