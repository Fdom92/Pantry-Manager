import { Injectable, inject } from '@angular/core';
import type { Insight, InsightContext } from '@core/models';
import type { PantryItem } from '@core/models/pantry';
import type { MeasurementUnit } from '@core/models/shared';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { InsightService } from './insight.service';

@Injectable({ providedIn: 'root' })
export class DashboardStoreService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly insightService = inject(InsightService);

  readonly pantryItems = this.pantryStore.items;
  readonly lowStockItems = this.pantryStore.lowStockItems;
  readonly nearExpiryItems = this.pantryStore.nearExpiryItems;
  readonly expiredItems = this.pantryStore.expiredItems;
  readonly inventorySummary = this.pantryStore.summary;
  readonly loading = this.pantryStore.loading;

  async loadAll(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  async deleteExpiredItems(): Promise<void> {
    await this.pantryStore.deleteExpiredItems();
  }

  isItemLowStock(item: PantryItem): boolean {
    return this.pantryStore.isItemLowStock(item);
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getItemPrimaryUnit(item: PantryItem) {
    return this.pantryStore.getItemPrimaryUnit(item);
  }

  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
  }

  getPendingReviewProducts(items: PantryItem[]) {
    return this.insightService.getPendingReviewProducts(items);
  }

  buildDashboardInsights(context: InsightContext): Insight[] {
    return this.insightService.buildDashboardInsights(context);
  }

  getVisibleInsights(insights: Insight[]): Insight[] {
    return this.insightService.getVisibleInsights(insights);
  }

  dismissInsight(id: string): void {
    this.insightService.dismiss(id);
  }
}
