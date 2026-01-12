import { Injectable, inject } from '@angular/core';
import { INSIGHTS_LIBRARY, PENDING_REVIEW_STALE_WINDOW_DAYS } from '@core/constants';
import {
  Insight,
  InsightContext,
  InsightCta,
  InsightCtaDefinition,
  InsightDefinition,
  InsightPendingReviewProduct,
  InsightPendingReviewReason,
  InsightPredicateHelpers,
  PantryItem,
} from '@core/models';
import { TranslateService } from '@ngx-translate/core';
import { ProService } from './pro.service';

@Injectable({ providedIn: 'root' })
export class InsightService {
  private readonly translate = inject(TranslateService);
  private readonly proService = inject(ProService);
  private readonly dismissedInsightIds = new Set<string>();
  private readonly pendingReviewStaleWindowDays = PENDING_REVIEW_STALE_WINDOW_DAYS;

  buildDashboardInsights(context: InsightContext): Insight[] {
    const isPro = this.proService.isPro();
    const helpers: InsightPredicateHelpers = { now: new Date() };
    return INSIGHTS_LIBRARY.filter(def => this.isAvailable(def, isPro))
      .filter(def => !def.predicate || def.predicate(context, helpers))
      .sort((a, b) => a.priority - b.priority)
      .map(def => this.toInsight(def))
      .slice(0, 2);
  }

  getPendingReviewProducts(
    items: PantryItem[],
    options?: { now?: Date; staleWindowDays?: number }
  ): InsightPendingReviewProduct[] {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }
    const now = options?.now ?? new Date();
    const staleWindowDays = options?.staleWindowDays ?? this.pendingReviewStaleWindowDays;
    const products = items
      .map(item => {
        const reasons: InsightPendingReviewReason[] = [];
        if (this.hasStaleUpdate(item, now, staleWindowDays)) {
          reasons.push('stale-update');
        }
        if (this.isMissingInformation(item)) {
          reasons.push('missing-info');
        }
        if (!reasons.length) {
          return null;
        }
        return {
          id: item._id,
          name: item.name,
          categoryId: item.categoryId,
          reasons,
        } as InsightPendingReviewProduct;
      })
      .filter((product): product is InsightPendingReviewProduct => Boolean(product));

    return products.sort((a, b) => {
      const scoreDiff = this.getPendingReviewPriority(b) - this.getPendingReviewPriority(a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const nameDiff = (a.name ?? '').localeCompare(b.name ?? '');
      if (nameDiff !== 0) {
        return nameDiff;
      }
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
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
      priority: definition.priority,
      dismissLabel: definition.dismissLabelKey ? this.translateKey(definition.dismissLabelKey) : undefined,
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

  private translateKey(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  private hasStaleUpdate(item: PantryItem, now: Date, staleWindowDays: number): boolean {
    const reference = item?.updatedAt ?? item?.createdAt;
    if (!reference) {
      return true;
    }
    const updatedAt = new Date(reference);
    if (Number.isNaN(updatedAt.getTime())) {
      return true;
    }
    const diffMs = now.getTime() - updatedAt.getTime();
    const staleMs = staleWindowDays * 24 * 60 * 60 * 1000;
    return diffMs >= staleMs;
  }

  private isMissingInformation(item: PantryItem): boolean {
    if (!item) {
      return true;
    }
    const hasCategory = Boolean((item.categoryId ?? '').trim());
    const hasDetailedLocation =
      item.locations?.some(location => {
        const id = (location.locationId ?? '').trim().toLowerCase();
        return Boolean(id) && id !== 'unassigned';
      }) ?? false;
    const hasExpiryDate =
      item.locations?.some(location =>
        (location.batches ?? []).some(batch => Boolean(batch.expirationDate))
      ) ?? false;
    const hasNoExpiryMarker = item.noExpiry === true;
    return !hasCategory || !hasDetailedLocation || !(hasExpiryDate || hasNoExpiryMarker);
  }

  private getPendingReviewPriority(product: InsightPendingReviewProduct): number {
    const reasons = product?.reasons ?? [];
    const hasMissing = reasons.includes('missing-info');
    const hasStale = reasons.includes('stale-update');
    return (hasMissing ? 2 : 0) + (hasStale ? 1 : 0);
  }
}
