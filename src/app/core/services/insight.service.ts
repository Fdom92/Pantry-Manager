import { Injectable, signal } from '@angular/core';
import { DashboardInsightContext, Insight, InsightTrigger, InsightType, ProductAddedInsightContext } from '@core/models';

@Injectable({ providedIn: 'root' })
export class InsightService {
  private readonly insights = signal<Insight[]>([]);

  getInsights(trigger: InsightTrigger): Insight[] {
    return this.insights().filter(insight => insight.trigger === trigger);
  }

  addInsight(insight: Insight): void {
    this.insights.update(list => [...list, insight]);
  }

  dismissInsight(insightId: string): void {
    this.insights.update(list => list.filter(insight => insight.id !== insightId));
  }

  clearTrigger(trigger: InsightTrigger): void {
    this.insights.update(list => list.filter(insight => insight.trigger !== trigger));
  }

  clearAll(): void {
    this.insights.set([]);
  }

  buildDashboardInsights(context: DashboardInsightContext): Insight[] {
  const { hasProAccess } = context;
  const insightId = crypto.randomUUID();

  return [
    {
      id: insightId,
      trigger: InsightTrigger.DASHBOARD,
      type: InsightType.WARNING,
      title: 'Productos a punto de caducar',
      message: 'Tienes productos que caducan pronto.',
      cta: {
        label: hasProAccess ? 'Ver detalles' : 'Desbloquear Pro',
        action: hasProAccess ? 'run-agent' : 'navigate',
        payload: hasProAccess
          ? { intent: 'expiring-soon', insightId }
          : { route: '/upgrade', insightId },
      },
      proOnly: !hasProAccess,
      createdAt: Date.now(),
    },
  ];
}

buildProductAddedInsights(context: ProductAddedInsightContext): Insight[] {
  const productName = context.product?.name;
  if (!productName) {
    return [];
  }

  const insightId = crypto.randomUUID();

  return [
    {
      id: insightId,
      trigger: InsightTrigger.PRODUCT_ADDED,
      type: InsightType.SUGGESTION,
      title: '¿Marcar como básico?',
      message: `¿Quieres marcar ${productName} como producto básico?`,
      cta: {
        label: 'Marcar',
        action: 'run-agent',
        payload: { intent: 'mark-basic', product: context.product, insightId },
      },
      createdAt: Date.now(),
    },
  ];
}

}
