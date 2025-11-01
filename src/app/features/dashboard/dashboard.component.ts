import { Component, computed, effect, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SeedService } from '@core/services';
import { PantryItem } from '@core/models';
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
  readonly locationCount = computed(() =>
    this.countDistinct(this.items().map(item => item.locationId))
  );
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

  async ionViewWillEnter(): Promise<void> {
    await this.seedService.ensureSeedData();
    await this.pantryStore.loadAll();
    this.hasInitialized = true;
    this.lastUpdated.set(new Date().toISOString());
  }

  get nearExpiryWindow(): number {
    return this.NEAR_EXPIRY_DAYS;
  }

  toggleSnapshot(): void {
    this.showSnapshot.update(open => !open);
  }

  private computeRecentItems(items: PantryItem[]): PantryItem[] {
    return [...items]
      .sort((a, b) => this.compareDates(b.updatedAt, a.updatedAt))
      .slice(0, 5);
  }

  private compareDates(a?: string, b?: string): number {
    const aTime = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }

  private countDistinct(values: (string | undefined)[]): number {
    return new Set(values.filter(Boolean)).size;
  }
}
