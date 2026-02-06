import { Signal, computed, inject, Injectable, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { getItemStatusState } from '@core/domain/pantry';
import { classifyExpiry } from '@core/domain/pantry/pantry-stock/pantry-stock';
import { PantryItem, PantrySummary } from '@core/models/pantry';
import { MeasurementUnit, StockStatus } from '@core/models/shared';
import { PantryService } from './pantry.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { EventLogService } from '../events';

@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  // DI
  private readonly pantryService = inject(PantryService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly eventLog = inject(EventLogService);
  // DATA
  private readonly knownMeasurementUnits = new Set(
    Object.values(MeasurementUnit).map(option => option.toLowerCase())
  );
  // SIGNALS
  readonly loading: Signal<boolean> = this.pantryService.loading;
  readonly endReached: Signal<boolean> = this.pantryService.endReached;
  readonly error = signal<string | null>(null);
  private realtimeSubscribed = false;
  private expiredScanInProgress = false;
  // COMPUTED
  readonly items = computed(() => this.pantryService.activeProducts());
  readonly expiredItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'expired');
  });
  readonly nearExpiryItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'near-expiry');
  });
  readonly lowStockItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'low-stock');
  });
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
      this.watchRealtime();
      this.error.set(null);
      void this.logExpiredBatchEvents(this.items());
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
      this.reviewPrompt.handleProductAdded();
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

  /** Simple alias used by views to trigger a full reload. */
  async refresh(): Promise<void> {
    await this.loadAll();
  }

  /** Bridge live database change events into the signal-based store. */
  watchRealtime(): void {
    // PantryService already updates its internal cache; this store simply exposes it.
    if (this.realtimeSubscribed) {
      return;
    }
    this.realtimeSubscribed = true;
    this.pantryService.watchPantryChanges(() => {
      void this.logExpiredBatchEvents(this.items());
    });
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
    const unit = item.batches[0]?.unit;
    if (typeof unit === 'string' && unit.trim()) {
      return unit.trim();
    }
    return MeasurementUnit.UNIT;
  }

  /** Sum every batch quantity to avoid duplicating reduce logic in components. */
  getItemTotalQuantity(item: PantryItem): number {
    return this.pantryService.getItemTotalQuantity(item);
  }

  /** Sum the minimum thresholds configured for the item. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return this.pantryService.getItemTotalMinThreshold(item);
  }

  /** Earliest expiry date considering all batches. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return this.pantryService.getItemEarliestExpiry(item);
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

  private async logExpiredBatchEvents(items: PantryItem[]): Promise<void> {
    if (this.expiredScanInProgress) {
      return;
    }
    this.expiredScanInProgress = true;
    try {
      const existing = await this.eventLog.listEvents();
      const seen = new Set(
        existing
          .filter(event => event.eventType === 'EXPIRE' || event.reason === 'expired')
          .map(event => String(event.sourceMetadata?.['batchKey'] ?? '').trim())
          .filter(Boolean)
      );
      const now = new Date();
      const tasks: Promise<unknown>[] = [];

      for (const item of items) {
        for (const batch of item.batches ?? []) {
          if (!batch?.expirationDate) {
            continue;
          }
          if (classifyExpiry(batch.expirationDate, now, 0) !== 'expired') {
            continue;
          }
          const batchKey = this.buildBatchKey(item._id, batch);
          if (seen.has(batchKey)) {
            continue;
          }
          const quantity = Number.isFinite(batch.quantity) ? batch.quantity : 0;
          if (quantity <= 0) {
            continue;
          }
          seen.add(batchKey);
          tasks.push(
            this.eventLog.logExpireEvent({
              productId: item._id,
              quantity,
              unit: batch.unit,
              batchId: batch.batchId,
              locationId: batch.locationId,
              reason: 'expired',
              sourceMetadata: {
                batchKey,
                expirationDate: batch.expirationDate,
              },
              source: 'system',
            })
          );
        }
      }

      if (tasks.length) {
        await Promise.all(tasks);
      }
    } catch (err) {
      console.error('[PantryStoreService] logExpiredBatchEvents error', err);
    } finally {
      this.expiredScanInProgress = false;
    }
  }

  private buildBatchKey(productId: string, batch: { batchId?: string; expirationDate?: string; locationId?: string }): string {
    if (batch.batchId) {
      return `${productId}::${batch.batchId}`;
    }
    const location = (batch.locationId ?? 'none').trim();
    const expiry = (batch.expirationDate ?? 'none').trim();
    return `${productId}::${location}::${expiry}`;
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
    return {
      ...existing,
      batches: [...(existing.batches ?? []), ...(incoming.batches ?? [])],
      brand: existing.brand ?? incoming.brand,
      barcode: existing.barcode ?? incoming.barcode,
      minThreshold: existing.minThreshold ?? incoming.minThreshold,
      isBasic: existing.isBasic ?? incoming.isBasic,
    };
  }

}
