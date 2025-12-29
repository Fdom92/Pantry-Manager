import { Injectable, inject } from '@angular/core';
import { INSIGHTS_LIBRARY } from '@core/constants';
import { Insight, InsightContext, InsightCta, InsightCtaDefinition, InsightDefinition, InsightPredicateHelpers } from '@core/models';
import { TranslateService } from '@ngx-translate/core';
import { ProService } from './pro.service';

@Injectable({ providedIn: 'root' })
export class InsightService {
  private readonly translate = inject(TranslateService);
  private readonly proService = inject(ProService);
  private readonly dismissedInsightIds = new Set<string>();

  buildDashboardInsights(context: InsightContext): Insight[] {
    const isPro = this.proService.isPro();
    const helpers: InsightPredicateHelpers = { now: new Date() };
    return INSIGHTS_LIBRARY.filter(def => this.isAvailable(def, isPro))
      .filter(def => !def.predicate || def.predicate(context, helpers))
      .sort((a, b) => a.priority - b.priority)
      .map(def => this.toInsight(def))
      .slice(0, 2);
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

  private isAvailable(definition: InsightDefinition, isPro: boolean): boolean {
    if (definition.audience === 'pro') {
      return isPro;
    }
    if (definition.audience === 'non-pro') {
      return !isPro;
    }
    return true;
  }

  private toInsight(definition: InsightDefinition): Insight {
    return {
      id: definition.id,
      title: this.translateKey(definition.titleKey),
      description: this.translateKey(definition.descriptionKey),
      severity: definition.severity,
      priority: definition.priority,
      ctas: definition.ctas?.map(cta => this.toCta(cta)).filter((cta): cta is InsightCta => Boolean(cta)),
    };
  }

  private toCta(definition: InsightCtaDefinition): InsightCta | null {
    if (definition.type === 'agent') {
      const prompt = this.translateKey(definition.promptKey);
      if (!prompt) {
        return null;
      }
      return {
        id: definition.id,
        label: this.translateKey(definition.labelKey),
        type: 'agent',
        entryContext: definition.entryContext,
        prompt,
      };
    }
    return {
      id: definition.id,
      label: this.translateKey(definition.labelKey),
      type: 'navigate',
      route: definition.route,
    };
  }

  private translateKey(key: string): string {
    return this.translate.instant(key);
  }
}
