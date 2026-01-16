import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { getRecentItemsByUpdatedAt } from '@core/domain/dashboard';
import { getLocationEarliestExpiry, getLocationQuantity } from '@core/domain/pantry';
import type { Insight, InsightContext, InsightCta, ItemLocationStock, PantryItem } from '@core/models';
import { ES_DATE_FORMAT_OPTIONS } from '@core/models';
import { AgentConversationStore } from '../agent/agent-conversation.store';
import { LanguageService } from '../shared/language.service';
import { DashboardStoreService } from './dashboard-store.service';
import {
  formatDateTimeValue,
  formatDateValue,
  formatQuantity,
  formatShortDate,
} from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class DashboardStateService {
  private readonly store = inject(DashboardStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly conversationStore = inject(AgentConversationStore);
  private readonly navCtrl = inject(NavController);

  private hasCompletedInitialLoad = false;

  readonly pantryItems = this.store.pantryItems;
  readonly lowStockItems = this.store.lowStockItems;
  readonly nearExpiryItems = this.store.nearExpiryItems;
  readonly expiredItems = this.store.expiredItems;
  readonly inventorySummary = this.store.inventorySummary;

  readonly isSnapshotCardExpanded = signal(true);
  readonly lastRefreshTimestamp = signal<string | null>(null);
  readonly isDeletingExpiredItems = signal(false);
  readonly visibleInsights = signal<Insight[]>([]);

  readonly totalItems = computed(() => this.inventorySummary().total);
  readonly recentlyUpdatedItems = computed(() => getRecentItemsByUpdatedAt(this.pantryItems()));
  readonly hasExpiredItems = computed(() => this.expiredItems().length > 0);

  get nearExpiryWindow(): number {
    return NEAR_EXPIRY_WINDOW_DAYS;
  }

  constructor() {
    effect(() => {
      const items = this.pantryItems();
      if (this.store.loading()) {
        return;
      }
      if (!this.hasCompletedInitialLoad) {
        return;
      }
      if (!items) {
        return;
      }
      this.lastRefreshTimestamp.set(new Date().toISOString());
    });

    effect(() => {
      const items = this.pantryItems();
      const expiringSoon = this.nearExpiryItems();
      const expired = this.expiredItems();
      const lowStock = this.lowStockItems();
      if (!this.hasCompletedInitialLoad) {
        return;
      }
      this.refreshDashboardInsights(items, expiringSoon, expired, lowStock);
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.store.loadAll();
    this.hasCompletedInitialLoad = true;
    this.lastRefreshTimestamp.set(new Date().toISOString());
  }

  dismissInsight(insight: Insight): void {
    this.store.dismissInsight(insight.id);
    this.visibleInsights.update(current => current.filter(item => item.id !== insight.id));
  }

  async onInsightAction(_: Insight, cta: InsightCta): Promise<void> {
    if (!cta) {
      return;
    }
    if (cta.type === 'navigate') {
      if (cta.route) {
        await this.navCtrl.navigateForward(cta.route);
      }
      return;
    }
    this.conversationStore.prepareConversation({
      entryContext: cta.entryContext,
      initialPrompt: cta.prompt,
    });
    await this.navCtrl.navigateForward('/agent');
  }

  toggleSnapshotCard(): void {
    this.isSnapshotCardExpanded.update(open => !open);
  }

  async onDeleteExpiredItems(): Promise<void> {
    if (!this.canDeleteExpiredItems()) {
      return;
    }

    if (!this.hasConfirmedExpiredDeletion()) {
      return;
    }

    this.isDeletingExpiredItems.set(true);
    try {
      await this.store.deleteExpiredItems();
    } catch (err) {
      console.error('[DashboardStateService] onDeleteExpiredItems error', err);
    } finally {
      this.isDeletingExpiredItems.set(false);
    }
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.store.getItemTotalQuantity(item);
  }

  getItemUnitLabel(item: PantryItem): string {
    const unit = this.store.getItemPrimaryUnit(item);
    return this.store.getUnitLabel(unit);
  }

  getItemTotalMinThreshold(item: PantryItem): number {
    return this.store.getItemTotalMinThreshold(item);
  }

  getItemLocationsSummary(item: PantryItem): string {
    return item.locations
      .map(location => {
        const quantity = this.formatQuantityValue(getLocationQuantity(location));
        const unit = this.store.getUnitLabel(location.unit ?? this.store.getItemPrimaryUnit(item));
        const name = this.formatLocationName(location.locationId);
        const batches = Array.isArray(location.batches) ? location.batches : [];
        if (batches.length) {
          const earliest = getLocationEarliestExpiry(location);
          const batchLabel = this.translate.instant(
            batches.length === 1 ? 'dashboard.batches.single' : 'dashboard.batches.plural',
            { count: batches.length }
          );
          const extra = earliest
            ? this.translate.instant('dashboard.batches.withExpiry', {
                batchLabel,
                date: formatShortDate(earliest, this.languageService.getCurrentLocale(), { fallback: earliest }),
              })
            : batchLabel;
          const extraSegment = extra ? ` (${extra})` : '';
          return `${quantity} ${unit} · ${name}${extraSegment}`;
        }
        return `${quantity} ${unit} · ${name}`;
      })
      .join(', ');
  }

  formatLastUpdated(value: string | null): string {
    return formatDateTimeValue(value, this.languageService.getCurrentLocale(), { fallback: '' });
  }

  formatDate(value?: string | null): string {
    return formatDateValue(value ?? null, this.languageService.getCurrentLocale(), ES_DATE_FORMAT_OPTIONS.numeric, {
      fallback: this.translate.instant('common.dates.none'),
    });
  }

  private formatLocationName(locationId?: string): string {
    const trimmed = (locationId ?? '').trim();
    return trimmed || this.translate.instant('common.locations.none');
  }

  private formatQuantityValue(value: number): string {
    return formatQuantity(value, this.languageService.getCurrentLocale(), {
      maximumFractionDigits: 1,
    });
  }

  private canDeleteExpiredItems(): boolean {
    return !this.isDeletingExpiredItems() && this.hasExpiredItems();
  }

  private hasConfirmedExpiredDeletion(): boolean {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.confirm(this.translate.instant('dashboard.confirmDeleteExpired'));
  }

  private refreshDashboardInsights(
    items: PantryItem[],
    expiringSoon: PantryItem[],
    expiredItems: PantryItem[],
    lowStockItems: PantryItem[],
  ): void {
    if (!items?.length) {
      this.visibleInsights.set([]);
      return;
    }

    const pendingReviewProducts = this.store.getPendingReviewProducts(items);

    const context: InsightContext = {
      expiringSoonItems: expiringSoon.map(item => ({
        id: item._id,
        isLowStock: this.store.isItemLowStock(item),
        quantity: this.store.getItemTotalQuantity(item),
      })),
      expiredItems: expiredItems.map(item => ({
        id: item._id,
        quantity: this.store.getItemTotalQuantity(item),
      })),
      expiringSoonCount: expiringSoon.length,
      lowStockCount: lowStockItems.length,
      products: items.map(item => ({
        id: item._id,
        name: item.name,
        categoryId: item.categoryId,
      })),
      pendingReviewProducts,
    };

    const generated = this.store.buildDashboardInsights(context);
    this.visibleInsights.set(this.store.getVisibleInsights(generated));
  }
}
