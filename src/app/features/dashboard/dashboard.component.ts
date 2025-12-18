import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { ES_DATE_FORMAT_OPTIONS, InsightCTA, InsightTrigger, ItemLocationStock, PantryItem } from '@core/models';
import { InsightService, InsightTriggerService, LanguageService } from '@core/services';
import { PantryStoreService } from '@core/store/pantry-store.service';
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
  private readonly insightTriggerService = inject(InsightTriggerService);
  // Data
  private hasInitialized = false;
  readonly items = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly summary = this.pantryStore.summary;
  // Signals
  readonly showSnapshot = signal(true);
  readonly dashboardInsights = computed(() =>
    this.insightService.getInsights(InsightTrigger.DASHBOARD)
  );

  readonly lastUpdated = signal<string | null>(null);
  readonly deletingExpired = signal(false);
  // Computed Signals
  readonly totalItems = computed(() => this.summary().total);
  readonly recentItems = computed(() => this.computeRecentItems(this.items()));
  // Getter
  get nearExpiryWindow(): number {
    return NEAR_EXPIRY_WINDOW_DAYS;
  }

  constructor() {
    effect(
      () => {
        // track list changes and mark the dashboard as refreshed
        const items = this.items();
        if (this.pantryStore.loading()) {
          return;
        }
        if (!this.hasInitialized) {
          return;
        }
        if (!items) {
          return;
        }
        this.lastUpdated.set(new Date().toISOString());
      }
    );
  }

  /** Lifecycle hook: populate dashboard data and stamp the refresh time. */
  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.hasInitialized = true;
    this.lastUpdated.set(new Date().toISOString());
    this.insightService.clearTrigger(InsightTrigger.DASHBOARD);
    this.insightTriggerService.trigger(InsightTrigger.DASHBOARD);
  }

  handleInsightAction(cta: InsightCTA): void {
    if (cta.action === 'dismiss' && cta.payload?.insightId) {
      this.insightService.dismissInsight(cta.payload.insightId);
      return;
    }
    // Future actions (agent, navigation, etc.) will be orchestrated upstream.
    console.debug('[DashboardComponent] Insight CTA selected', cta);
  }

  /** Toggle the visibility of the snapshot card without altering other state. */
  toggleSnapshot(): void {
    this.showSnapshot.update(open => !open);
  }

  /** Remove expired items after a minimal confirmation. */
  async onDeleteExpiredItems(): Promise<void> {
    if (this.deletingExpired() || this.expiredItems().length === 0) {
      return;
    }

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(this.translate.instant('dashboard.confirmDeleteExpired'));

    if (!confirmed) {
      return;
    }

    this.deletingExpired.set(true);
    try {
      await this.pantryStore.deleteExpiredItems();
    } catch (err) {
      console.error('[DashboardComponent] onDeleteExpiredItems error', err);
    } finally {
      this.deletingExpired.set(false);
    }
  }

  /** Return the latest five updated items so the dashboard highlights recent activity. */
  private computeRecentItems(items: PantryItem[]): PantryItem[] {
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
  private formatLocationName(id?: string): string {
    const trimmed = (id ?? '').trim();
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
}
