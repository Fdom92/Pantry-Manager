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
import { withSignalFlag, isWeekend } from '@core/utils';
import { ConfirmService } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryService } from '../pantry/pantry.service';
import { DashboardInsightService } from './dashboard-insight.service';
import { formatDateTimeValue, formatDateValue } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { AgentEntryContext } from '@core/models/agent';

export enum PantryHealthState {
  CRITICAL = 'critical',
  ATTENTION = 'attention',
  OPTIMAL = 'optimal'
}

export interface PantryHealth {
  state: PantryHealthState;
  title: string;
  description: string;
  accentColor: 'danger' | 'warning' | 'success';
}

export enum ActionPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

export interface ActionCta {
  label: string;
  action: () => void | Promise<void> |Promise<boolean>;
}

export interface DashboardAction {
  id: string;
  priority: ActionPriority;
  category: 'critical' | 'preventive' | 'optimization' | 'conversion';
  title: string;
  description: string;
  cta: ActionCta;
  dismissible: boolean;
}

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
  private readonly revenueCat = inject(UpgradeRevenuecatService);

  private hasCompletedInitialLoad = false;
  private readonly dismissedActionIds = signal(new Set<string>());

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
  readonly basicProductsCount = computed(() => {
    const items = this.pantryItems();
    if (!items?.length) {
      return 0;
    }
    return items.filter(item => item.isBasic === true).length;
  });
  readonly completeProductsCount = computed(() => {
    const items = this.pantryItems();
    if (!items?.length) {
      return 0;
    }
    return items.filter(item => item.isBasic !== true && item.batches && item.batches.length > 0).length;
  });
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

  readonly pantryHealth = computed((): PantryHealth => {
    const expired = this.expiredItems().length;
    const nearExpiry = this.nearExpiryItems().length;
    const stale = this.stalePantryItemsCount();
    const total = this.totalItems();
    const withDates = this.completeProductsCount();

    // CRITICAL: Urgent action required
    if (expired > 0) {
      return {
        state: PantryHealthState.CRITICAL,
        title: this.translate.instant('dashboard.health.critical.title'),
        description: this.translate.instant('dashboard.health.critical.description'),
        accentColor: 'danger',
      };
    }

    // ATTENTION: Prevention needed
    if (nearExpiry > 0) {
      return {
        state: PantryHealthState.ATTENTION,
        title: this.translate.instant('dashboard.health.attention.title'),
        description: this.translate.instant('dashboard.health.attention.description'),
        accentColor: 'warning',
      };
    }

    // Low tracking but no urgency
    if (total > 10 && withDates < total * 0.3) {
      return {
        state: PantryHealthState.ATTENTION,
        title: this.translate.instant('dashboard.health.attention.trackingTitle'),
        description: this.translate.instant('dashboard.health.attention.trackingDescription'),
        accentColor: 'warning',
      };
    }

    // OPTIMAL: Everything under control
    if (stale > 5) {
      return {
        state: PantryHealthState.OPTIMAL,
        title: this.translate.instant('dashboard.health.optimal.controlledTitle'),
        description: this.translate.instant('dashboard.health.optimal.controlledDescription'),
        accentColor: 'success',
      };
    }

    return {
      state: PantryHealthState.OPTIMAL,
      title: this.translate.instant('dashboard.health.optimal.perfectTitle'),
      description: this.translate.instant('dashboard.health.optimal.perfectDescription'),
      accentColor: 'success',
    };
  });

  readonly stalePantryItems = computed(() => {
    const now = this.getReferenceNow();
    const staleThresholdDays = 30;
    const staleThresholdMs = staleThresholdDays * 24 * 60 * 60 * 1000;

    return this.pantryItems().filter(item => {
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      if (totalQuantity <= 0) {
        return false;
      }

      const updatedAt = new Date(item.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) {
        return false;
      }

      return now.getTime() - updatedAt.getTime() > staleThresholdMs;
    });
  });

  readonly stalePantryItemsCount = computed(() => this.stalePantryItems().length);

  readonly actions = computed((): DashboardAction[] => {
    const actions: DashboardAction[] = [];
    const expired = this.expiredItems().length;
    const nearExpiry = this.nearExpiryItems().length;
    const stale = this.stalePantryItemsCount();
    const isPro = this.revenueCat.isPro();

    // LAYER 1: CRITICAL (always first)
    if (expired > 0) {
      const descKey = expired === 1 ? 'dashboard.actions.expired.description_one' : 'dashboard.actions.expired.description_other';
      actions.push({
        id: 'expired-action',
        priority: ActionPriority.CRITICAL,
        category: 'critical',
        title: this.translate.instant('dashboard.actions.expired.title'),
        description: this.translate.instant(descKey, { count: expired }),
        cta: {
          label: this.translate.instant('dashboard.actions.expired.cta'),
          action: () => this.onOverviewCardSelected('expired'),
        },
        dismissible: false,
      });
    }

    // LAYER 2: PREVENTIVE (only if no critical OR there's space)
    if (nearExpiry > 0) {
      actions.push({
        id: 'near-expiry-action',
        priority: ActionPriority.HIGH,
        category: 'preventive',
        title: isPro
          ? this.translate.instant('dashboard.actions.nearExpiry.titlePro')
          : this.translate.instant('dashboard.actions.nearExpiry.title'),
        description: this.translate.instant('dashboard.actions.nearExpiry.description', {
          count: nearExpiry,
          days: NEAR_EXPIRY_WINDOW_DAYS,
        }),
        cta: isPro
          ? {
              label: this.translate.instant('dashboard.actions.nearExpiry.ctaPro'),
              action: () => this.launchAgentWithPrompt('cook-before-expiry'),
            }
          : {
              label: this.translate.instant('dashboard.actions.nearExpiry.cta'),
              action: () => this.onOverviewCardSelected('near-expiry'),
            },
        dismissible: true,
      });
    }

    // LAYER 3: OPTIMIZATION (only if NO critical or preventive urgent)
    if (actions.length === 0) {
      if (stale > 5) {
        actions.push({
          id: 'stale-items-optimization',
          priority: ActionPriority.MEDIUM,
          category: 'optimization',
          title: this.translate.instant('dashboard.actions.stale.title'),
          description: this.translate.instant('dashboard.actions.stale.description', { count: stale }),
          cta: {
            label: this.translate.instant('dashboard.actions.stale.cta'),
            action: () => {
              // Navigate to pantry with stale filter
              this.pantryService.setPendingNavigationPreset({ recentlyAdded: false });
              void this.navCtrl.navigateRoot('/pantry');
            },
          },
          dismissible: true,
        });
      }

      // PRO users: Smart suggestions only when no urgency
      if (isPro && isWeekend(new Date())) {
        actions.push({
          id: 'weekly-meal-planning',
          priority: ActionPriority.MEDIUM,
          category: 'optimization',
          title: this.translate.instant('dashboard.actions.weeklyPlan.title'),
          description: this.translate.instant('dashboard.actions.weeklyPlan.description'),
          cta: {
            label: this.translate.instant('dashboard.actions.weeklyPlan.cta'),
            action: () => this.launchAgentWithPrompt('weekly-plan'),
          },
          dismissible: true,
        });
      }
    }

    // LAYER 4: CONVERSION (only if NO critical AND user is non-pro)
    const hasCritical = actions.filter(a => a.category === 'critical').length > 0;
    if (!hasCritical && !isPro) {
      // Only show PRO if there's valuable context
      if (nearExpiry > 0 || this.completeProductsCount() >= 5) {
        actions.push({
          id: 'upgrade-contextual',
          priority: ActionPriority.LOW,
          category: 'conversion',
          title: this.translate.instant('dashboard.actions.upgrade.title'),
          description: this.translate.instant('dashboard.actions.upgrade.description'),
          cta: {
            label: this.translate.instant('dashboard.actions.upgrade.cta'),
            action: () => this.navCtrl.navigateForward('/upgrade'),
          },
          dismissible: true,
        });
      }
    }

    // Sort by priority and ensure category diversity, max 2
    return actions
      .sort((a, b) => a.priority - b.priority)
      .filter((action, index, arr) => {
        if (index === 0) {
          return true;
        }
        return action.category !== arr[0].category;
      })
      .slice(0, 2)
      .filter(action => !this.dismissedActionIds().has(action.id));
  });

  readonly showAdditionalContext = computed(() => {
    const criticalActions = this.actions().filter(a => a.priority === ActionPriority.CRITICAL);
    return criticalActions.length === 0;
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

  dismissAction(action: DashboardAction): void {
    this.dismissedActionIds.update(ids => new Set([...ids, action.id]));
  }

  getHealthIcon(state: PantryHealthState): string {
    switch (state) {
      case PantryHealthState.CRITICAL:
        return 'alert-circle';
      case PantryHealthState.ATTENTION:
        return 'warning';
      case PantryHealthState.OPTIMAL:
        return 'checkmark-circle';
      default:
        return 'information-circle';
    }
  }

  private launchAgentWithPrompt(promptId: string): void {
    let prompt = '';
    let entryContext = AgentEntryContext.INSIGHTS;

    switch (promptId) {
      case 'cook-before-expiry':
        prompt = this.translate.instant('insights.library.cookBeforeExpiry.prompt');
        entryContext = AgentEntryContext.INSIGHTS_RECIPES;
        break;
      case 'weekly-plan':
        prompt = this.translate.instant('insights.library.weeklyMealPlanning.prompt');
        entryContext = AgentEntryContext.INSIGHTS;
        break;
      default:
        return;
    }

    this.conversationStore.prepareConversation({
      entryContext,
      initialPrompt: prompt,
    });
    void this.navCtrl.navigateForward('/agent');
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
