import { Injectable, inject } from '@angular/core';
import type { InsightPendingReviewProduct, PantryItem } from '@core/models';
import type { MeasurementUnit } from '@core/models/shared';
import { AppPreferencesService } from '../settings/app-preferences.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { InsightService } from '../dashboard/insight.service';

@Injectable({ providedIn: 'root' })
export class UpToDateStoreService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly insightService = inject(InsightService);
  private readonly appPreferencesService = inject(AppPreferencesService);

  readonly pantryItems = this.pantryStore.items;

  getPendingReviewProducts(items: PantryItem[]): InsightPendingReviewProduct[] {
    return this.insightService.getPendingReviewProducts(items);
  }

  getLocationOptions(): string[] {
    return this.appPreferencesService.preferences().locationOptions ?? [];
  }

  getCategoryOptions(): string[] {
    return this.appPreferencesService.preferences().categoryOptions ?? [];
  }

  async loadAll(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  async updateItem(item: PantryItem): Promise<void> {
    await this.pantryStore.updateItem(item);
  }

  async deleteItem(id: string): Promise<void> {
    await this.pantryStore.deleteItem(id);
  }

  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getItemPrimaryUnit(item: PantryItem): string {
    return String(this.pantryStore.getItemPrimaryUnit(item));
  }
}
