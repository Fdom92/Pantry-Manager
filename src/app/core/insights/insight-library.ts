import { Insight, InsightTrigger, InsightType } from './insight.types';

export interface DashboardInsightContext {
  hasProAccess: boolean;
}

export interface ProductAddedInsightContext {
  product?: { name?: string } | null;
}

export function buildDashboardInsights(context: DashboardInsightContext): Insight[] {
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

export function buildProductAddedInsights(context: ProductAddedInsightContext): Insight[] {
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
