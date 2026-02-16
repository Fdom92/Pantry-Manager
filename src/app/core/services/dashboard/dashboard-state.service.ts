import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS } from '@core/constants';
import { getRecentItemsByUpdatedAt } from '@core/domain/dashboard';
import { getItemStatusState } from '@core/domain/pantry';
import type {
  Insight,
  InsightContext,
  InsightCta,
  PantryItem,
} from '@core/models';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import { ES_DATE_FORMAT_OPTIONS } from '@core/models';
import { PlannerConversationStore } from '../planner/planner-conversation.store';
import { LanguageService } from '../shared/language.service';
import { withSignalFlag } from '@core/utils';
import { ConfirmService } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryService } from '../pantry/pantry.service';
import { DashboardInsightService } from './dashboard-insight.service';
import { formatDateTimeValue, formatDateValue } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';


@Injectable()
export class DashboardStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly insightService = inject(DashboardInsightService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly conversationStore = inject(PlannerConversationStore);
  private readonly navCtrl = inject(NavController);
  private readonly confirm = inject(ConfirmService);
  private readonly reviewPrompt = inject(ReviewPromptService);

  private hasCompletedInitialLoad = false;

  readonly pantryItems = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly inventorySummary = this.pantryStore.summary;
  readonly isInventoryLoading = computed(() =>
    this.pantryStore.loading() || !this.pantryStore.endReached()
  );
  readonly isInitialInventoryLoading = computed(() =>
    !this.hasCompletedInitialLoad && (this.pantryStore.loading() || !this.pantryStore.endReached())
  );

  readonly isSnapshotCardExpanded = signal(true);
  readonly lastRefreshTimestamp = signal<string | null>(null);
  readonly isDeletingExpiredItems = signal(false);
  readonly visibleInsights = signal<Insight[]>([]);

  readonly totalItems = computed(() => this.inventorySummary().total);
  readonly recentlyUpdatedItems = computed(() => getRecentItemsByUpdatedAt(this.pantryItems()));
  readonly hasExpiredItems = computed(() => this.expiredItems().length > 0);
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
    if (this.isDeletingExpiredItems() || !this.hasExpiredItems()) {
      return;
    }

    if (!this.confirm.confirm(this.translate.instant('dashboard.confirmDeleteExpired'))) {
      return;
    }

    await withSignalFlag(this.isDeletingExpiredItems, async () => {
      const expiredItems = this.expiredItems();
      if (!expiredItems.length) {
        return;
      }

      await Promise.all(expiredItems.map(item => this.pantryStore.deleteItem(item._id)));
    }).catch(err => {
      console.error('[DashboardStateService] deleteExpiredItems error', err);
    });
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
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

    const now = new Date();

    const context: InsightContext = {
      expiringSoonItems: expiringSoon.map(item => ({
        id: item._id,
        isLowStock: getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'low-stock',
        quantity: this.pantryStore.getItemTotalQuantity(item),
      })),
      expiredItems: expiredItems.map(item => ({
        id: item._id,
      })),
      expiringSoonCount: expiringSoon.length,
      lowStockCount: lowStockItems.length,
      products: items.map(item => ({
        id: item._id,
        name: item.name,
        categoryId: item.categoryId,
      })),
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

}
