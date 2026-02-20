import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { getItemStatusState } from '@core/domain/pantry';
import { PantryFilterState, PantryItem, PantrySummary } from '@core/models/pantry';
import { StockStatus } from '@core/models/shared';
import { normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryService } from './pantry.service';

@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  private readonly pantryService = inject(PantryService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private realtimeSubscribed = false;
  private expiredScanInProgress = false;
  readonly error = signal<string | null>(null);
  readonly loading: Signal<boolean> = this.pantryService.loading;
  readonly endReached: Signal<boolean> = this.pantryService.endReached;
  readonly searchQuery: Signal<string> = this.pantryService.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryService.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryService.pipelineResetting;
  readonly totalCount: Signal<number> = this.pantryService.totalCount;
  readonly loadedProducts: Signal<PantryItem[]> = this.pantryService.loadedProducts;
  readonly activeProducts: Signal<PantryItem[]> = this.pantryService.activeProducts;
  readonly filteredProducts: Signal<PantryItem[]> = this.pantryService.filteredProducts;
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
      await this.ensureFirstPageLoaded();
      this.startBackgroundLoad();
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

  clearEntryFilters(): void {
    this.pantryService.clearEntryFilters();
  }

  applyPendingNavigationPreset(): void {
    this.pantryService.applyPendingNavigationPreset();
  }

  async ensureFirstPageLoaded(): Promise<void> {
    await this.pantryService.ensureFirstPageLoaded();
  }

  startBackgroundLoad(): void {
    this.pantryService.startBackgroundLoad();
  }

  setSearchQuery(value: string): void {
    this.pantryService.setSearchQuery(value);
  }

  setFilters(filters: Partial<PantryFilterState>): void {
    this.pantryService.setFilters(filters);
  }

  async addNewLot(
    itemId: string,
    params: { quantity: number; expiryDate?: string; location?: string }
  ): Promise<PantryItem | null> {
    return this.pantryService.addNewLot(itemId, params);
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
    const key = this.buildMergeKey(candidate);

    const localItems = this.items();

    if (key) {
      const localKeyMatch = localItems.find(item => this.buildMergeKey(item) === key);
      if (localKeyMatch) {
        return localKeyMatch;
      }
    }

    const persisted = await this.pantryService.getAll();

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
      await this.eventManager.logExpiredBatches(items);
    } catch (err) {
      console.error('[PantryStoreService] logExpiredBatchEvents error', err);
    } finally {
      this.expiredScanInProgress = false;
    }
  }

  private buildMergeKey(item: PantryItem): string | null {
    const name = normalizeLowercase(item.name);
    const category = normalizeTrim(item.categoryId);
    const supermarket = normalizeLowercase(item.supermarket);
    if (!name || !supermarket) {
      return null;
    }
    return `${name}::${category || 'uncategorized'}::${supermarket}`;
  }

  private mergeItemWithExisting(existing: PantryItem, incoming: PantryItem): PantryItem {
    return {
      ...existing,
      batches: [...(existing.batches ?? []), ...(incoming.batches ?? [])],
      minThreshold: existing.minThreshold ?? incoming.minThreshold,
      isBasic: existing.isBasic ?? incoming.isBasic,
    };
  }

}
