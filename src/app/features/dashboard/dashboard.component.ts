import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import {
  ES_DATE_FORMAT_OPTIONS,
  Insight,
  InsightActionEvent,
  InsightCTAAction,
  InsightEvaluationContext,
  ItemLocationStock,
  PantryItem,
} from '@core/models';
import { InsightService, LanguageService, PantryStoreService } from '@core/services';
import {
  formatDateTimeValue,
  formatDateValue,
  formatQuantity,
  formatShortDate,
} from '@core/utils/formatting.util';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';
import { InsightCardComponent } from '@shared/components/insight-card/insight-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
    IonSpinner,
    CommonModule,
    TranslateModule,
    EmptyStateGenericComponent,
    InsightCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly insightService = inject(InsightService);
  // Data
  private hasCompletedInitialLoad = false;
  readonly pantryItems = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly inventorySummary = this.pantryStore.summary;
  // Signals
  readonly isSnapshotCardExpanded = signal(true);
  readonly lastRefreshTimestamp = signal<string | null>(null);
  readonly isDeletingExpiredItems = signal(false);
  // Computed Signals
  readonly totalItems = computed(() => this.inventorySummary().total);
  readonly recentlyUpdatedItems = computed(() => this.getRecentItemsByUpdatedAt(this.pantryItems()));
  readonly hasExpiredItems = computed(() => this.expiredItems().length > 0);
  readonly dashboardInsight = computed<Insight | null>(() => this.evaluateDashboardInsight());
  // Getter
  get nearExpiryWindow(): number {
    return NEAR_EXPIRY_WINDOW_DAYS;
  }

  constructor() {
    effect(
      () => {
        // track list changes and mark the dashboard as refreshed
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
      }
    );
  }

  /** Lifecycle hook: populate dashboard data and stamp the refresh time. */
  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.hasCompletedInitialLoad = true;
    this.lastRefreshTimestamp.set(new Date().toISOString());
  }

  handleInsightAction(event: InsightActionEvent): void {
    const { action } = event;
    if (typeof action === 'function') {
      action();
      return;
    }

    switch (action) {
      case InsightCTAAction.VIEW_EXPIRING_PRODUCTS:
        console.debug('[DashboardComponent] Ver productos a punto de caducar', event);
        break;
      case InsightCTAAction.VIEW_RECIPES:
        console.debug('[DashboardComponent] Ver recetas sugeridas', event);
        break;
      case InsightCTAAction.REVIEW_SHOPPING:
        console.debug('[DashboardComponent] Revisar compra', event);
        break;
      case InsightCTAAction.ADD_TO_SHOPPING:
        console.debug('[DashboardComponent] Añadir a compra', event);
        break;
      case InsightCTAAction.VIEW_SHOPPING_LIST:
        console.debug('[DashboardComponent] Ver lista de compra', event);
        break;
      default:
        console.debug('[DashboardComponent] Insight CTA seleccionado', event);
    }
  }

  private evaluateDashboardInsight(): Insight | null {
    const items = this.pantryItems();
    if (!items?.length) {
      return null;
    }
    const context: InsightEvaluationContext = {
      products: items,
      expiringSoon: this.nearExpiryItems(),
      outOfStock: items.filter(item => this.pantryStore.getItemTotalQuantity(item) <= 0),
      lowStock: this.lowStockItems(),
      shoppingList: items.filter(item => this.shouldAddToShoppingList(item)),
      lastRecipeGeneratedAt: undefined,
      currentView: 'Dashboard',
    };
    return this.insightService.evaluateInsights(context);
  }

  private shouldAddToShoppingList(item: PantryItem): boolean {
    const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
    const minThreshold = this.pantryStore.getItemTotalMinThreshold(item);
    if (item.isBasic && totalQuantity <= 0) {
      return true;
    }
    if (item.isBasic && minThreshold > 0 && totalQuantity < minThreshold) {
      return true;
    }
    if (minThreshold > 0 && totalQuantity < minThreshold) {
      return true;
    }
    return minThreshold <= 0 && totalQuantity <= 0;
  }

  /** Toggle the visibility of the snapshot card without altering other state. */
  toggleSnapshotCard(): void {
    this.isSnapshotCardExpanded.update(open => !open);
  }

  /** Remove expired items after a minimal confirmation. */
  async onDeleteExpiredItems(): Promise<void> {
    if (!this.canDeleteExpiredItems()) {
      return;
    }

    if (!this.hasConfirmedExpiredDeletion()) {
      return;
    }

    this.isDeletingExpiredItems.set(true);
    try {
      await this.pantryStore.deleteExpiredItems();
    } catch (err) {
      console.error('[DashboardComponent] onDeleteExpiredItems error', err);
    } finally {
      this.isDeletingExpiredItems.set(false);
    }
  }

  /** Return the latest five updated items so the dashboard highlights recent activity. */
  private getRecentItemsByUpdatedAt(items: PantryItem[]): PantryItem[] {
    return [...items]
      .sort((a, b) => this.compareDates(b.updatedAt, a.updatedAt))
      .slice(0, 5);
  }

  /** Compare ISO dates and gracefully fallback when timestamps are missing. */
  private compareDates(a?: string, b?: string): number {
    const aTime = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }

  /** Total quantity across all locations for dashboard chips. */
  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  /** Resolve a unit label so the UI can display quantities consistently. */
  getItemUnitLabel(item: PantryItem): string {
    const unit = this.pantryStore.getItemPrimaryUnit(item);
    return this.pantryStore.getUnitLabel(unit);
  }

  /** Sum the minimum thresholds to highlight items that need attention. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
  }

  /** Compose a per-item breakdown showing how stock is distributed across locations. */
  getItemLocationsSummary(item: PantryItem): string {
    return item.locations
      .map(location => {
        const quantity = this.formatQuantityValue(this.getLocationQuantity(location));
        const unit = this.pantryStore.getUnitLabel(location.unit ?? this.pantryStore.getItemPrimaryUnit(item));
        const name = this.formatLocationName(location.locationId);
        const batches = Array.isArray(location.batches) ? location.batches : [];
        if (batches.length) {
          const earliest = this.getLocationEarliestExpiry(location);
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

  /** Map raw location ids into friendly labels for dashboard display. */
  private formatLocationName(locationId?: string): string {
    const trimmed = (locationId ?? '').trim();
    return trimmed || this.translate.instant('common.locations.none');
  }

  private getLocationQuantity(location: ItemLocationStock): number {
    if (!Array.isArray(location.batches) || !location.batches.length) {
      return 0;
    }
    return location.batches.reduce((sum, batch) => sum + Number(batch.quantity ?? 0), 0);
  }

  private formatQuantityValue(value: number): string {
    return formatQuantity(value, this.languageService.getCurrentLocale(), {
      maximumFractionDigits: 1,
    });
  }

  private getLocationEarliestExpiry(location: ItemLocationStock): string | undefined {
    const batches = Array.isArray(location.batches) ? location.batches : [];
    const dates = batches
      .map(batch => batch.expirationDate)
      .filter((date): date is string => Boolean(date));
    if (!dates.length) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
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

}
