import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS } from '@core/constants';
import { getRecentItemsByUpdatedAt } from '@core/domain/dashboard';
import { getLocationEarliestExpiry, getLocationQuantity } from '@core/domain/pantry';
import type { Insight, InsightContext, InsightCta, ItemLocationStock, PantryItem } from '@core/models';
import { ES_DATE_FORMAT_OPTIONS } from '@core/models';
import { AgentConversationStore } from '../agent/agent-conversation.store';
import { LanguageService } from '../shared/language.service';
import { ConfirmService, withSignalFlag } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryService } from '../pantry/pantry.service';
import { InsightService } from './insight.service';
import {
  formatDateTimeValue,
  formatDateValue,
  formatQuantity,
  formatShortDate,
} from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

export type DashboardOverviewCardId =
  | 'expired'
  | 'near-expiry'
  | 'pending-review'
  | 'low-or-empty'
  | 'recently-added'
  | 'shopping';

@Injectable()
export class DashboardStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly insightService = inject(InsightService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly conversationStore = inject(AgentConversationStore);
  private readonly navCtrl = inject(NavController);
  private readonly confirm = inject(ConfirmService);
  private readonly reviewPrompt = inject(ReviewPromptService);

  private hasCompletedInitialLoad = false;

  readonly pantryItems = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly inventorySummary = this.pantryStore.summary;

  readonly isSnapshotCardExpanded = signal(true);
  readonly lastRefreshTimestamp = signal<string | null>(null);
  readonly isDeletingExpiredItems = signal(false);
  readonly visibleInsights = signal<Insight[]>([]);

  readonly totalItems = computed(() => this.inventorySummary().total);
  readonly recentlyUpdatedItems = computed(() => getRecentItemsByUpdatedAt(this.pantryItems()));
  readonly hasExpiredItems = computed(() => this.expiredItems().length > 0);
  readonly pendingReviewProducts = computed(() =>
    this.insightService.getPendingReviewProducts(this.pantryItems(), { now: this.getReferenceNow() })
  );
  readonly shoppingListCount = computed(() => {
    const items = this.pantryItems();
    if (!items?.length) {
      return 0;
    }
    return items.reduce((total, item) => {
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      const minThreshold = this.pantryStore.getItemTotalMinThreshold(item);
      return this.pantryStore.shouldAutoAddToShoppingList(item, { totalQuantity, minThreshold }) ? total + 1 : total;
    }, 0);
  });
  readonly recentlyAddedCount = computed(() => {
    const now = this.getReferenceNow();
    const windowMs = RECENTLY_ADDED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return this.pantryItems().filter(item => {
      const createdAt = new Date(item.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return false;
      }
      return now.getTime() - createdAt.getTime() <= windowMs;
    }).length;
  });

  get nearExpiryWindow(): number {
    return NEAR_EXPIRY_WINDOW_DAYS;
  }

  constructor() {
    effect(() => {
      const items = this.pantryItems();
      if (this.pantryStore.loading()) {
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
    await this.pantryStore.loadAll();
    this.hasCompletedInitialLoad = true;
    this.lastRefreshTimestamp.set(new Date().toISOString());
    void this.reviewPrompt.handleDashboardEnter();
  }

  dismissInsight(insight: Insight): void {
    this.insightService.dismiss(insight.id);
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

  async onOverviewCardSelected(card: DashboardOverviewCardId): Promise<void> {
    const count = this.getOverviewCardCount(card);
    if (count <= 0) {
      return;
    }

    switch (card) {
      case 'pending-review':
        await this.navCtrl.navigateForward('/up-to-date');
        return;
      case 'expired':
        this.pantryService.setPendingNavigationPreset({ expired: true });
        await this.navCtrl.navigateRoot('/pantry');
        return;
      case 'near-expiry':
        this.pantryService.setPendingNavigationPreset({ expiring: true });
        await this.navCtrl.navigateRoot('/pantry');
        return;
      case 'low-or-empty':
        this.pantryService.setPendingNavigationPreset({ lowStock: true });
        await this.navCtrl.navigateRoot('/pantry');
        return;
      case 'recently-added':
        this.pantryService.setPendingNavigationPreset({ recentlyAdded: true });
        await this.navCtrl.navigateRoot('/pantry');
        return;
      case 'shopping':
        await this.navCtrl.navigateRoot('/shopping');
        return;
      default:
        return;
    }
  }

  toggleSnapshotCard(): void {
    this.isSnapshotCardExpanded.update(open => !open);
  }

  async deleteExpiredItems(): Promise<void> {
    if (!this.canDeleteExpiredItems()) {
      return;
    }

    if (!this.hasConfirmedExpiredDeletion()) {
      return;
    }

    await withSignalFlag(this.isDeletingExpiredItems, async () => {
      await this.pantryStore.deleteExpiredItems();
    }).catch(err => {
      console.error('[DashboardStateService] deleteExpiredItems error', err);
    });
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getItemUnitLabel(item: PantryItem): string {
    const unit = this.pantryStore.getItemPrimaryUnit(item);
    return this.pantryStore.getUnitLabel(unit);
  }

  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
  }

  getItemLocationsSummary(item: PantryItem): string {
    return item.locations
      .map(location => {
        const quantity = this.formatQuantityValue(getLocationQuantity(location));
        const unit = this.pantryStore.getUnitLabel(location.unit ?? this.pantryStore.getItemPrimaryUnit(item));
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

  private getReferenceNow(): Date {
    const timestamp = this.lastRefreshTimestamp();
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
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
    return this.confirm.confirm(this.translate.instant('dashboard.confirmDeleteExpired'));
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

    const pendingReviewProducts = this.insightService.getPendingReviewProducts(items);

    const context: InsightContext = {
      expiringSoonItems: expiringSoon.map(item => ({
        id: item._id,
        isLowStock: this.pantryStore.isItemLowStock(item),
        quantity: this.pantryStore.getItemTotalQuantity(item),
      })),
      expiredItems: expiredItems.map(item => ({
        id: item._id,
        quantity: this.pantryStore.getItemTotalQuantity(item),
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

    const generated = this.insightService.buildDashboardInsights(context);
    this.visibleInsights.set(this.insightService.getVisibleInsights(generated));
  }

  private getOverviewCardCount(card: DashboardOverviewCardId): number {
    switch (card) {
      case 'expired':
        return this.expiredItems().length;
      case 'near-expiry':
        return this.nearExpiryItems().length;
      case 'pending-review':
        return this.pendingReviewProducts().length;
      case 'low-or-empty':
        return this.lowStockItems().length;
      case 'recently-added':
        return this.recentlyAddedCount();
      case 'shopping':
        return this.shoppingListCount();
      default:
        return 0;
    }
  }

  private getOverviewCardEmptyToastKey(card: DashboardOverviewCardId): string {
    switch (card) {
      case 'expired':
        return 'dashboard.overview.toasts.expiredEmpty';
      case 'near-expiry':
        return 'dashboard.overview.toasts.nearExpiryEmpty';
      case 'pending-review':
        return 'dashboard.overview.toasts.pendingReviewEmpty';
      case 'low-or-empty':
        return 'dashboard.overview.toasts.lowOrEmptyEmpty';
      case 'recently-added':
        return 'dashboard.overview.toasts.recentlyAddedEmpty';
      case 'shopping':
        return 'dashboard.overview.toasts.shoppingEmpty';
      default:
        return 'dashboard.overview.toasts.genericEmpty';
    }
  }

}
