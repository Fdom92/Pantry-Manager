import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { InsightService } from '@core/insights/insight.service';
import { InsightTriggerService } from '@core/insights/insight-trigger.service';
import { InsightCTA, InsightTrigger } from '@core/insights/insight.types';
import { ES_DATE_FORMAT_OPTIONS, ItemLocationStock, PantryItem } from '@core/models';
import { LanguageService } from '@core/services';
import { PantryStoreService } from '@core/store/pantry-store.service';
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
import { InsightCardComponent } from '@shared/components/insight-card/insight-card.component';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';

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
  private hasInitialized = false;

  readonly lastUpdated = signal<string | null>(null);
  readonly deletingExpired = signal(false);
  readonly items = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly summary = this.pantryStore.summary;
  readonly showSnapshot = signal(true);
  readonly dashboardInsights = computed(() =>
    this.insightService.getInsights(InsightTrigger.DASHBOARD)
  );

  readonly totalItems = computed(() => this.summary().total);
  readonly recentItems = computed(() => this.computeRecentItems(this.items()));

  constructor(
    private readonly pantryStore: PantryStoreService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService,
    private readonly insightService: InsightService,
    private readonly insightTriggerService: InsightTriggerService,
  ) {
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

  get nearExpiryWindow(): number {
    return NEAR_EXPIRY_WINDOW_DAYS;
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

  /** Count distinct non-empty values; used by summary badges. */
  private countDistinct(values: (string | undefined)[]): number {
    return new Set(values.filter(Boolean)).size;
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
                date: this.formatShortDate(earliest),
              })
            : batchLabel;
          const extraSegment = extra ? ` (${extra})` : '';
          return `${quantity} ${unit} · ${name}${extraSegment}`;
        }
        return `${quantity} ${unit} · ${name}`;
      })
      .join(', ');
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
    const rounded = Math.round((Number(value) || 0) * 10) / 10;
    return rounded.toFixed(1).replace(/\.0$/, '');
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

  private formatShortDate(value: string): string {
    const locale = this.languageService.getCurrentLocale();
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return parsed.toLocaleDateString(locale, ES_DATE_FORMAT_OPTIONS.numeric);
    } catch {
      return value;
    }
  }

  formatLastUpdated(value: string | null): string {
    if (!value) {
      return '';
    }
    const locale = this.languageService.getCurrentLocale();
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return '';
      }
      const datePart = parsed.toLocaleDateString(locale, ES_DATE_FORMAT_OPTIONS.numeric);
      const timePart = parsed.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `${datePart} ${timePart}`;
    } catch {
      return '';
    }
  }

  formatExpiryFull(value?: string | null): string {
    return this.formatDateWithOptions(value, ES_DATE_FORMAT_OPTIONS.numeric);
  }

  formatExpiryBadge(value?: string | null): string {
    return this.formatDateWithOptions(value, ES_DATE_FORMAT_OPTIONS.numeric);
  }

  handleInsightAction(cta: InsightCTA): void {
    if (cta.action === 'dismiss' && cta.payload?.insightId) {
      this.insightService.dismissInsight(cta.payload.insightId);
      return;
    }
    // Future actions (agent, navigation, etc.) will be orchestrated upstream.
    console.debug('[DashboardComponent] Insight CTA selected', cta);
  }

  private formatDateWithOptions(
    value: string | Date | null | undefined,
    options: Intl.DateTimeFormatOptions
  ): string {
    if (!value) {
      return this.translate.instant('common.dates.none');
    }
    const locale = this.languageService.getCurrentLocale();
    try {
      const parsed = typeof value === 'string' ? new Date(value) : value;
      if (Number.isNaN(parsed.getTime())) {
        return this.translate.instant('common.dates.none');
      }
      return parsed.toLocaleDateString(locale, options);
    } catch {
      return this.translate.instant('common.dates.none');
    }
  }
}
