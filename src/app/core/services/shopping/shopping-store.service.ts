import { Injectable, inject } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import type { MeasurementUnit } from '@core/models/shared';
import { PantryService } from '../pantry/pantry.service';
import { PantryStoreService } from '../pantry/pantry-store.service';

@Injectable({ providedIn: 'root' })
export class ShoppingStoreService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);

  readonly loading = this.pantryStore.loading;
  readonly items = this.pantryStore.items;

  async loadAll(): Promise<void> {
    await this.pantryStore.loadAll();
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

  shouldAutoAddToShoppingList(item: PantryItem, context?: { totalQuantity?: number; minThreshold?: number | null }): boolean {
    return this.pantryStore.shouldAutoAddToShoppingList(item, context);
  }

  async addNewLot(
    itemId: string,
    data: { quantity: number; expiryDate?: string; location: string }
  ): Promise<void> {
    await this.pantryService.addNewLot(itemId, data);
  }
}
