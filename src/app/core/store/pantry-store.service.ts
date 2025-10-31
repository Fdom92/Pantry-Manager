import { Injectable, signal, computed } from '@angular/core';
import { PantryItem, MeasurementUnit, StockStatus } from '@core/models';
import { PantryService } from '@core/services/pantry.service';

@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  /** --- Main state signal --- */
  private readonly itemsSignal = signal<PantryItem[]>([]);
  readonly items = computed(() => this.itemsSignal());

  /** --- Loading & error state --- */
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** --- Derived computed signals --- */
  readonly expiredItems = computed(() => {
    const now = new Date();
    return this.items().filter(i => {
      if (!i.expirationDate) return false;
      const exp = new Date(i.expirationDate);
      exp.setHours(0, 0, 0, 0);
      return exp < now;
    });
  });

  readonly nearExpiryItems = computed(() => {
    const now = new Date();
    const limit = new Date();
    limit.setDate(now.getDate() + 3);
    return this.items().filter(i => {
      if (!i.expirationDate) return false;
      const exp = new Date(i.expirationDate);
      return exp > now && exp <= limit;
    });
  });

  readonly lowStockItems = computed(() =>
    this.items().filter(i =>
      i.stock?.minThreshold != null && i.stock.quantity <= i.stock.minThreshold
    )
  );

  /** --- Quick summary for dashboard or analytics --- */
  readonly summary = computed(() => ({
    total: this.items().length,
    expired: this.expiredItems().length,
    nearExpiry: this.nearExpiryItems().length,
    lowStock: this.lowStockItems().length,
  }));

  constructor(private readonly pantryService: PantryService) {}

  /** --- Load all items from local DB or storage --- */
  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const all = await this.pantryService.getAll();
      this.itemsSignal.set(all);
      this.error.set(null);
    } catch (err: any) {
      console.error('[PantryStoreService] loadAll error', err);
      this.error.set(err.message || 'Error loading pantry items');
    } finally {
      this.loading.set(false);
    }
  }

  /** --- Add a new pantry item --- */
  async addItem(item: PantryItem): Promise<void> {
    try {
      const saved = await this.pantryService.saveItem(item);
      this.itemsSignal.update(items => [...items, saved]);
    } catch (err: any) {
      console.error('[PantryStoreService] addItem error', err);
      this.error.set('Failed to add item');
    }
  }

  /** --- Update an existing pantry item --- */
  async updateItem(item: PantryItem): Promise<void> {
    try {
      const updated = await this.pantryService.saveItem(item);
      this.itemsSignal.update(items =>
        items.map(i => (i._id === updated._id ? updated : i))
      );
    } catch (err: any) {
      console.error('[PantryStoreService] updateItem error', err);
      this.error.set('Failed to update item');
    }
  }

  /** --- Delete an item by ID --- */
  async deleteItem(id: string): Promise<void> {
    try {
      const ok = await this.pantryService.deleteItem(id);
      if (ok) {
        this.itemsSignal.update(items => items.filter(i => i._id !== id));
      }
    } catch (err: any) {
      console.error('[PantryStoreService] deleteItem error', err);
      this.error.set('Failed to delete item');
    }
  }

  /** --- Update only the stock quantity --- */
  async adjustQuantity(id: string, delta: number): Promise<void> {
    try {
      const current = this.items().find(i => i._id === id);
      if (!current || !current.stock) return;
      const nextQty = Math.max(0, current.stock.quantity + delta);
      const updated = await this.pantryService.updateStock(id, nextQty);
      if (updated) {
        this.itemsSignal.update(items =>
          items.map(i => (i._id === updated._id ? updated : i))
        );
      }
    } catch (err: any) {
      console.error('[PantryStoreService] adjustQuantity error', err);
      this.error.set('Failed to adjust quantity');
    }
  }

  /** --- Refresh data manually (useful for pull-to-refresh or dashboard) --- */
  async refresh(): Promise<void> {
    await this.loadAll();
  }

  /** --- Real-time change listener (if storage supports it) --- */
  watchRealtime(): void {
    this.pantryService.watchPantryChanges(() => {
      this.loadAll();
    });
  }

  /** --- Utility: Compute stock status for quick logic reuse --- */
  getStockStatus(item: PantryItem): StockStatus {
    if (!item.stock) return StockStatus.EMPTY;
    if (item.stock.quantity <= 0) return StockStatus.EMPTY;
    if (
      item.stock.minThreshold != null &&
      item.stock.quantity <= item.stock.minThreshold
    ) {
      return StockStatus.LOW;
    }
    return StockStatus.NORMAL;
  }

  /** --- Utility: Format units cleanly --- */
  getUnitLabel(unit: MeasurementUnit): string {
    return unit === MeasurementUnit.UNIT ? 'pcs' : unit.toLowerCase();
  }
}
