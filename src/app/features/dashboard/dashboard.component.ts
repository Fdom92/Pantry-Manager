import { Component, computed, effect, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SeedService } from '@core/services';
import { ItemLocationStock, PantryItem } from '@core/models';
import { PantryStoreService } from '@core/store/pantry-store.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  private readonly NEAR_EXPIRY_DAYS = 3;
  private hasInitialized = false;

  readonly lastUpdated = signal<string | null>(null);
  readonly items = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly summary = this.pantryStore.summary;
  readonly showSnapshot = signal(true);

  readonly totalItems = computed(() => this.summary().total);
  readonly alertCount = computed(
    () =>
      this.lowStockItems().length +
      this.nearExpiryItems().length +
      this.expiredItems().length
  );
  readonly categoryCount = computed(() =>
    this.countDistinct(this.items().map(item => item.categoryId))
  );
  readonly locationCount = computed(() => {
    const ids: string[] = [];
    for (const item of this.items()) {
      for (const location of item.locations) {
        if (location.locationId) {
          ids.push(location.locationId);
        }
      }
    }
    return this.countDistinct(ids);
  });
  readonly recentItems = computed(() => this.computeRecentItems(this.items()));

  constructor(
    private readonly seedService: SeedService,
    private readonly pantryStore: PantryStoreService
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
      },
      { allowSignalWrites: true }
    );
  }

  /** Lifecycle hook: populate dashboard data and stamp the refresh time. */
  async ionViewWillEnter(): Promise<void> {
    // await this.seedService.ensureSeedData();
    await this.pantryStore.loadAll();
    this.hasInitialized = true;
    this.lastUpdated.set(new Date().toISOString());
  }

  get nearExpiryWindow(): number {
    return this.NEAR_EXPIRY_DAYS;
  }

  /** Toggle the visibility of the snapshot card without altering other state. */
  toggleSnapshot(): void {
    this.showSnapshot.update(open => !open);
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
        const quantity = Number(location.quantity ?? 0).toFixed(1).replace(/\.0$/, '');
        const unit = this.pantryStore.getUnitLabel(location.unit ?? this.pantryStore.getItemPrimaryUnit(item));
        const name = this.formatLocationName(location.locationId);
        return `${quantity} ${unit} · ${name}`;
      })
      .join(', ');
  }

  /** Map raw location ids into friendly labels for dashboard display. */
  private formatLocationName(id?: string): string {
    const value = (id ?? '').trim();
    if (!value) {
      return 'Unassigned';
    }
    switch (value.toLowerCase()) {
      case 'pantry':
        return 'Pantry';
      case 'fridge':
        return 'Fridge';
      case 'freezer':
        return 'Freezer';
      case 'kitchen':
        return 'Kitchen';
      default:
        return value
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  }
}
