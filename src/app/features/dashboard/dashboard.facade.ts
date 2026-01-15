import { Injectable, inject } from '@angular/core';
import type { Insight, InsightCta, PantryItem } from '@core/models';
import { DashboardStateService } from '@core/services/dashboard';

@Injectable()
export class DashboardFacade {
  private readonly state = inject(DashboardStateService);

  readonly pantryItems = this.state.pantryItems;
  readonly lowStockItems = this.state.lowStockItems;
  readonly nearExpiryItems = this.state.nearExpiryItems;
  readonly expiredItems = this.state.expiredItems;
  readonly inventorySummary = this.state.inventorySummary;

  readonly isSnapshotCardExpanded = this.state.isSnapshotCardExpanded;
  readonly lastRefreshTimestamp = this.state.lastRefreshTimestamp;
  readonly isDeletingExpiredItems = this.state.isDeletingExpiredItems;
  readonly visibleInsights = this.state.visibleInsights;

  readonly totalItems = this.state.totalItems;
  readonly recentlyUpdatedItems = this.state.recentlyUpdatedItems;
  readonly hasExpiredItems = this.state.hasExpiredItems;

  get nearExpiryWindow(): number {
    return this.state.nearExpiryWindow;
  }

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  dismissInsight(insight: Insight): void {
    this.state.dismissInsight(insight);
  }

  async onInsightAction(insight: Insight, cta: InsightCta): Promise<void> {
    await this.state.onInsightAction(insight, cta);
  }

  toggleSnapshotCard(): void {
    this.state.toggleSnapshotCard();
  }

  async onDeleteExpiredItems(): Promise<void> {
    await this.state.onDeleteExpiredItems();
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.state.getItemTotalQuantity(item);
  }

  getItemUnitLabel(item: PantryItem): string {
    return this.state.getItemUnitLabel(item);
  }

  getItemTotalMinThreshold(item: PantryItem): number {
    return this.state.getItemTotalMinThreshold(item);
  }

  getItemLocationsSummary(item: PantryItem): string {
    return this.state.getItemLocationsSummary(item);
  }

  formatLastUpdated(value: string | null): string {
    return this.state.formatLastUpdated(value);
  }

  formatDate(value?: string | null): string {
    return this.state.formatDate(value);
  }
}

