import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { computeTodaySuggestion } from '@core/domain/dashboard';
import { applyFifoConsumption } from '@core/domain/pantry';
import type { TodaySuggestion } from '@core/domain/dashboard';
import type {
  PantryItem,
} from '@core/models';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import { LanguageService } from '../shared/language.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryService } from '../pantry/pantry.service';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

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
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly navCtrl = inject(NavController);
  private readonly reviewPrompt = inject(ReviewPromptService);

  private hasCompletedInitialLoad = false;
  private readonly dismissedActionIds = signal(new Set<string>());

  readonly pantryItems = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly reviewItems = this.pantryStore.reviewItems;
  readonly expiredItems = this.pantryStore.expiredItems;

  readonly inventorySummary = this.pantryStore.summary;
  readonly isInventoryLoading = computed(() =>
    this.pantryStore.loading() || !this.pantryStore.endReached()
  );
  readonly isInitialInventoryLoading = computed(() =>
    !this.hasCompletedInitialLoad && (this.pantryStore.loading() || !this.pantryStore.endReached())
  );

  readonly lastRefreshTimestamp = signal<string | null>(null);

  // Today's suggestion block
  readonly isCookingConfirmed = signal(false);
  readonly isConsumingToday = signal(false);
  private readonly lastProtagonistId = signal<string | undefined>(undefined);
  private readonly dismissedTodayIds = signal(new Set<string>());

  readonly totalItems = computed(() => this.inventorySummary().total);
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

  readonly noExpiryDateCount = computed(() => {
    return this.pantryItems().filter(item => {
      if (item.isBasic) return false;
      // Fresh items naturally lack precise dates — exclude from quality warnings
      if (item.productType === 'fresh') return false;
      const hasBatchDate = item.batches?.some(b => !!b.expirationDate);
      const hasItemDate = !!item.expirationDate;
      if (hasBatchDate || hasItemDate) return false;
      // Exclude items where all batches are explicitly marked as no-expiry
      const allMarkedNoExpiry = item.batches?.length > 0 && item.batches.every(b => !!b.noExpiry);
      return !allMarkedNoExpiry;
    }).length;
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

  readonly todaySuggestion = computed((): TodaySuggestion | null => {
    const raw = computeTodaySuggestion(
      this.nearExpiryItems(),
      this.pantryItems(),
      this.lastProtagonistId(),
    );
    if (!raw) return null;
    if (this.dismissedTodayIds().has(raw.protagonist.id)) return null;
    return raw;
  });

  readonly hasLowDataQuality = computed((): boolean =>
    !this.todaySuggestion() && this.noExpiryDateCount() >= 3
  );

  readonly nextExpiringItem = computed((): { name: string; daysToExpiry: number } | null => {
    if (this.todaySuggestion()) return null;
    const nowMs = Date.now();
    let earliest: { name: string; daysToExpiry: number } | null = null;
    for (const item of this.pantryItems()) {
      const stock = (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);
      if (stock <= 0) continue;
      for (const batch of item.batches ?? []) {
        if (!batch.expirationDate) continue;
        const days = Math.ceil((Date.parse(batch.expirationDate) - nowMs) / 86_400_000);
        if (days <= 0) continue;
        if (!earliest || days < earliest.daysToExpiry) {
          earliest = { name: item.name, daysToExpiry: days };
        }
      }
    }
    return earliest;
  });

  readonly actions = computed((): DashboardAction[] => {
    const actions: DashboardAction[] = [];
    const expired = this.expiredItems().length;
    const nearExpiry = this.nearExpiryItems().length;
    const lowStock = this.lowStockItems().length;
    const stale = this.stalePantryItemsCount();

    // CRITICAL: expired items
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

    // PREVENTIVE: near-expiry (PRO users get AI recipe suggestion via insights layer)
    if (nearExpiry > 0) {
      actions.push({
        id: 'near-expiry-action',
        priority: ActionPriority.HIGH,
        category: 'preventive',
        title: this.translate.instant('dashboard.actions.nearExpiry.title'),
        description: this.translate.instant('dashboard.actions.nearExpiry.description', {
          count: nearExpiry,
          days: NEAR_EXPIRY_WINDOW_DAYS,
        }),
        cta: {
          label: this.translate.instant('dashboard.actions.nearExpiry.cta'),
          action: () => this.onOverviewCardSelected('near-expiry'),
        },
        dismissible: true,
      });
    }

    // PREVENTIVE: low stock
    if (lowStock > 0) {
      const descKey = lowStock === 1 ? 'dashboard.actions.lowStock.description_one' : 'dashboard.actions.lowStock.description_other';
      actions.push({
        id: 'low-stock-action',
        priority: ActionPriority.MEDIUM,
        category: 'preventive',
        title: this.translate.instant('dashboard.actions.lowStock.title'),
        description: this.translate.instant(descKey, { count: lowStock }),
        cta: {
          label: this.translate.instant('dashboard.actions.lowStock.cta'),
          action: () => this.onOverviewCardSelected('low-or-empty'),
        },
        dismissible: true,
      });
    }

    // OPTIMIZATION: stale items (only if no urgency)
    const hasUrgent = actions.some(a => a.category === 'critical' || a.category === 'preventive');
    if (!hasUrgent && stale > 5) {
      actions.push({
        id: 'stale-items-optimization',
        priority: ActionPriority.MEDIUM,
        category: 'optimization',
        title: this.translate.instant('dashboard.actions.stale.title'),
        description: this.translate.instant('dashboard.actions.stale.description', { count: stale }),
        cta: {
          label: this.translate.instant('dashboard.actions.stale.cta'),
          action: () => {
            this.pantryService.setPendingNavigationPreset({ recentlyAdded: false });
            void this.navCtrl.navigateRoot('/pantry');
          },
        },
        dismissible: true,
      });
    }

    return actions
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 2)
      .filter(action => !this.dismissedActionIds().has(action.id));
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
  }

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.hasCompletedInitialLoad = true;
    this.lastRefreshTimestamp.set(new Date().toISOString());
    void this.reviewPrompt.handleDashboardEnter();
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
      case 'shopping':
        await this.navCtrl.navigateRoot('/list');
        return;
      default:
        return;
    }
  }

  dismissAction(action: DashboardAction): void {
    this.dismissedActionIds.update(ids => new Set([...ids, action.id]));
  }

  dismissToday(): void {
    const suggestion = this.todaySuggestion();
    if (!suggestion) return;
    this.dismissedTodayIds.update(ids => new Set([...ids, suggestion.protagonist.id]));
  }

  async actOnToday(): Promise<void> {
    const suggestion = this.todaySuggestion();
    if (!suggestion || this.isConsumingToday()) return;

    this.isConsumingToday.set(true);
    try {
      const item = this.pantryItems().find(i => i._id === suggestion.protagonist.id);
      if (item?.batches?.length) {
        const updatedBatches = applyFifoConsumption(item.batches, 1);
        await this.pantryStore.updateItem({ ...item, batches: updatedBatches });
      }
      this.lastProtagonistId.set(suggestion.protagonist.id);
      this.isCookingConfirmed.set(true);
      void this.reviewPrompt.handleConsumeCompleted();
      setTimeout(() => this.isCookingConfirmed.set(false), 2500);
    } finally {
      this.isConsumingToday.set(false);
    }
  }

  async markFreshItemOut(id: string): Promise<void> {
    if (this.isConsumingToday()) return;
    const item = this.pantryItems().find(i => i._id === id);
    if (!item) return;
    this.isConsumingToday.set(true);
    try {
      const updatedBatch = { ...(item.batches?.[0] ?? { quantity: 0 }), quantity: 0 };
      await this.pantryStore.updateItem({ ...item, batches: [updatedBatch] });
      this.lastProtagonistId.set(id);
      this.isCookingConfirmed.set(true);
      setTimeout(() => this.isCookingConfirmed.set(false), 2500);
    } finally {
      this.isConsumingToday.set(false);
    }
  }

  formatExpiryRelative(value: string | undefined): string | null {
    if (!value) return null;
    const diffDays = Math.ceil((Date.parse(value) - Date.now()) / 86_400_000);
    if (diffDays <= 0) return this.translate.instant('dashboard.today.expiry.today');
    if (diffDays === 1) return this.translate.instant('dashboard.today.expiry.tomorrow');
    return this.translate.instant('dashboard.today.expiry.inDays', { count: diffDays });
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

  private getOverviewCardCount(card: DashboardOverviewCardId): number {
    switch (card) {
      case 'expired':
        return this.expiredItems().length;
      case 'near-expiry':
        return this.nearExpiryItems().length;
      case 'low-or-empty':
        return this.lowStockItems().length;
      case 'shopping':
        return this.shoppingListCount();
      default:
        return 0;
    }
  }

}
