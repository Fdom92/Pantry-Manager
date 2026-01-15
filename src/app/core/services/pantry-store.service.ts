import { Signal, computed, inject, Injectable, signal } from '@angular/core';
import { PantryItem, PantrySummary } from '@core/models/pantry';
import { MeasurementUnit, StockStatus } from '@core/models/shared';
import { PantryService } from '@core/services/pantry.service';
import { normalizeLocationId } from '@core/utils/normalization.util';

@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  // DI
  private readonly pantryService = inject(PantryService);
  // Data
  private readonly knownMeasurementUnits = new Set(
    Object.values(MeasurementUnit).map(option => option.toLowerCase())
  );
  // Signals
  readonly loading: Signal<boolean> = this.pantryService.loading;
  readonly error = signal<string | null>(null);
  // Computed Signals
  readonly items = computed(() => this.pantryService.loadedProducts());
  readonly expiredItems = computed(() =>
    this.items().filter(item => this.pantryService.isItemExpired(item))
  );
  readonly nearExpiryItems = computed(() =>
    this.items().filter(item => this.pantryService.isItemNearExpiry(item))
  );
  readonly lowStockItems = computed(() =>
    this.items().filter(item => this.pantryService.isItemLowStock(item))
  );
  readonly summary = computed<PantrySummary>(() => ({
    total: this.items().length,
    expired: this.expiredItems().length,
    nearExpiry: this.nearExpiryItems().length,
    lowStock: this.lowStockItems().length,
  }));

  /** Load items from storage, updating loading/error signals accordingly. */
  async loadAll(): Promise<void> {
    try {
      await this.pantryService.ensureFirstPageLoaded();
      this.pantryService.startBackgroundLoad();
      this.error.set(null);
    } catch (err: any) {
      console.error('[PantryStoreService] loadAll error', err);
      this.error.set(err.message || 'Error loading pantry items');
    }
  }

  /** Push a freshly saved item into the local store state. */
  async addItem(item: PantryItem): Promise<void> {
    try {
      const mergeTarget = await this.findMergeCandidate(item);
      if (mergeTarget) {
        const merged = this.mergeItemWithExisting(mergeTarget, item);
        await this.pantryService.saveItem(merged);
        return;
      }

      await this.pantryService.saveItem(item);
    } catch (err: any) {
      console.error('[PantryStoreService] addItem error', err);
      this.error.set('Failed to add item');
    }
  }

  /** Replace an existing item in the signal cache with its latest version. */
  async updateItem(item: PantryItem): Promise<void> {
    try {
      await this.pantryService.saveItem(item);
    } catch (err: any) {
      console.error('[PantryStoreService] updateItem error', err);
      this.error.set('Failed to update item');
    }
  }

  /** Remove an item from the local cache once deletion succeeds. */
  async deleteItem(id: string): Promise<void> {
    try {
      await this.pantryService.deleteItem(id);
    } catch (err: any) {
      console.error('[PantryStoreService] deleteItem error', err);
      this.error.set('Failed to delete item');
    }
  }

  /** Remove every expired item currently cached in the store. */
  async deleteExpiredItems(): Promise<void> {
    const expiredIds = this.expiredItems().map(item => item._id);
    if (!expiredIds.length) {
      return;
    }
    await Promise.all(expiredIds.map(id => this.deleteItem(id)));
  }

  /**
   * Adjust the quantity stored for a specific location and persist the change.
   * Falls back to the first location so legacy data still works.
   */
  async adjustQuantity(id: string, locationId: string, delta: number): Promise<void> {
    try {
      const current = this.items().find(i => i._id === id);
      if (!current) return;

      const location = current.locations.find(loc => loc.locationId === locationId) ?? current.locations[0];
      if (!location) return;

      const currentQuantity = this.pantryService.getItemQuantityByLocation(current, location.locationId);
      const nextQty = Math.max(0, currentQuantity + delta);
      await this.pantryService.updateLocationQuantity(id, nextQty, location.locationId);
    } catch (err: any) {
      console.error('[PantryStoreService] adjustQuantity error', err);
      this.error.set('Failed to adjust quantity');
    }
  }

  /** Simple alias used by views to trigger a full reload. */
  async refresh(): Promise<void> {
    await this.loadAll();
  }

  /** Bridge live database change events into the signal-based store. */
  watchRealtime(): void {
    // PantryService already updates its internal cache; this store simply exposes it.
    this.pantryService.watchPantryChanges(() => {});
  }

  /** Compute an aggregate stock status based on total quantity and thresholds. */
  getStockStatus(item: PantryItem): StockStatus {
    const totalQuantity = this.pantryService.getItemTotalQuantity(item);
    if (totalQuantity <= 0) {
      return StockStatus.EMPTY;
    }

    const minThreshold = this.pantryService.getItemTotalMinThreshold(item);
    if (minThreshold > 0 && totalQuantity < minThreshold) {
      return StockStatus.LOW;
    }
    return StockStatus.NORMAL;
  }

  /** Return a human friendly unit label; defaults to lowercase plural. */
  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    const value = typeof unit === 'string' && unit.trim() ? unit.trim() : MeasurementUnit.UNIT;
    const lower = value.toLowerCase();
    if (lower === MeasurementUnit.UNIT.toLowerCase()) {
      return 'pcs';
    }
    if (this.knownMeasurementUnits.has(lower)) {
      return lower;
    }
    return value;
  }

  /** Helper used by UI layers to choose a representative unit. */
  getItemPrimaryUnit(item: PantryItem): MeasurementUnit | string {
    const unit = item.locations[0]?.unit;
    if (typeof unit === 'string' && unit.trim()) {
      return unit.trim();
    }
    return MeasurementUnit.UNIT;
  }

  /** Sum every location quantity to avoid duplicating reduce logic in components. */
  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryService.getItemTotalQuantity(item);
  }

  /** Sum the minimum thresholds configured for the item. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryService.getItemTotalMinThreshold(item);
  }

  /** Earliest expiry date considering all batches and locations. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return this.pantryService.getItemEarliestExpiry(item);
  }

  /** True when the item is in a low-stock situation. */
  isItemLowStock(item: PantryItem): boolean {
    return this.pantryService.isItemLowStock(item);
  }

  /** True when at least one location has already expired. */
  isItemExpired(item: PantryItem): boolean {
    return this.pantryService.isItemExpired(item);
  }

  /** True when any location expires within the near-expiry window. */
  isItemNearExpiry(item: PantryItem): boolean {
    return this.pantryService.isItemNearExpiry(item);
  }

  /** Aggregate quantity for a specific location ID across the item. */
  getItemQuantityByLocation(item: PantryItem, locationId: string): number {
    return this.pantryService.getItemQuantityByLocation(item, locationId);
  }

  /** Flatten all batches associated with an item. */
  getItemBatches(item: PantryItem) {
    return this.pantryService.getItemBatches(item);
  }

  /** Determine whether any batch for the item is currently marked as opened. */
  hasItemOpenBatch(item: PantryItem): boolean {
    return this.pantryService.hasOpenBatch(item);
  }

  /** Single source of truth for deciding whether an item should be auto-added to shopping list. */
  shouldAutoAddToShoppingList(
    item: PantryItem,
    context?: { totalQuantity?: number; minThreshold?: number | null }
  ): boolean {
    return this.pantryService.shouldAutoAddToShoppingList(item, context);
  }

  private async findMergeCandidate(candidate: PantryItem): Promise<PantryItem | undefined> {
    const barcode = this.normalizeBarcode(candidate.barcode);
    const key = this.buildMergeKey(candidate);

    const localItems = this.items();

    if (barcode) {
      const localBarcodeMatch = localItems.find(item => this.normalizeBarcode(item.barcode) === barcode);
      if (localBarcodeMatch) {
        return localBarcodeMatch;
      }
    }

    if (key) {
      const localKeyMatch = localItems.find(item => this.buildMergeKey(item) === key);
      if (localKeyMatch) {
        return localKeyMatch;
      }
    }

    const persisted = await this.pantryService.getAll();

    if (barcode) {
      const remoteBarcode = persisted.find(item => this.normalizeBarcode(item.barcode) === barcode);
      if (remoteBarcode) {
        return remoteBarcode;
      }
    }

    if (key) {
      return persisted.find(item => this.buildMergeKey(item) === key);
    }

    return undefined;
  }

  private buildMergeKey(item: PantryItem): string | null {
    const name = (item.name ?? '').trim().toLowerCase();
    const category = (item.categoryId ?? '').trim();
    const supermarket = (item.supermarket ?? '').trim().toLowerCase();
    if (!name || !supermarket) {
      return null;
    }
    return `${name}::${category || 'uncategorized'}::${supermarket}`;
  }

  private normalizeBarcode(value?: string): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed || null;
  }

  private mergeItemWithExisting(existing: PantryItem, incoming: PantryItem): PantryItem {
    const normalizedLocations = existing.locations.map(location => ({
      ...location,
      batches: Array.isArray(location.batches) ? [...location.batches] : [],
    }));

    for (const newLocation of incoming.locations ?? []) {
      const locationId = normalizeLocationId(newLocation.locationId);
      if (!locationId) {
        continue;
      }
      const targetIndex = normalizedLocations.findIndex(
        location => normalizeLocationId(location.locationId) === locationId
      );
      const newBatches = Array.isArray(newLocation.batches) ? [...newLocation.batches] : [];

      if (targetIndex >= 0) {
        const current = normalizedLocations[targetIndex];
        const mergedBatches = Array.isArray(current.batches) ? current.batches : [];
        normalizedLocations[targetIndex] = {
          ...current,
          unit: current.unit || newLocation.unit,
          batches: [...mergedBatches, ...newBatches],
        };
      } else {
        normalizedLocations.push({
          locationId,
          unit: newLocation.unit,
          batches: newBatches,
        });
      }
    }

    return {
      ...existing,
      locations: normalizedLocations,
      brand: existing.brand ?? incoming.brand,
      barcode: existing.barcode ?? incoming.barcode,
      minThreshold: existing.minThreshold ?? incoming.minThreshold,
      isBasic: existing.isBasic ?? incoming.isBasic,
    };
  }

}
