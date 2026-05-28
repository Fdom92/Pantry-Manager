import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import {
  collectBatches,
  computeEarliestExpiry,
  getItemStatusState,
  hasOpenBatch,
  shouldAutoAddToShoppingList as shouldAutoAddToShoppingListDomain,
  sumQuantities,
} from '@core/domain/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { generateBatchId } from '@core/utils';
import type { PantryFilterState, PantryItem, PantrySummary } from '@core/models/pantry';
import { StockStatus } from '@core/models/shared';
import { normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryQueryService } from './pantry-query.service';

@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  private readonly pantryQuery = inject(PantryQueryService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private realtimeSubscribed = false;
  private expiredScanInProgress = false;

  // ─── Exposed signals (delegated from PantryQueryService) ──────────────────

  readonly error = signal<string | null>(null);
  readonly loading: Signal<boolean> = this.pantryQuery.loading;
  readonly endReached: Signal<boolean> = this.pantryQuery.endReached;
  readonly searchQuery: Signal<string> = this.pantryQuery.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryQuery.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryQuery.pipelineResetting;
  readonly totalCount: Signal<number> = this.pantryQuery.totalCount;
  readonly loadedProducts: Signal<PantryItem[]> = this.pantryQuery.loadedProducts;
  readonly activeProducts: Signal<PantryItem[]> = this.pantryQuery.activeProducts;
  readonly filteredProducts: Signal<PantryItem[]> = this.pantryQuery.filteredProducts;

  // ─── Computed views ───────────────────────────────────────────────────────

  readonly items = computed(() => this.pantryQuery.activeProducts());

  readonly expiredItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'expired');
  });

  readonly nearExpiryItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'near-expiry');
  });

  readonly reviewItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'review');
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

  // ─── Business operations ──────────────────────────────────────────────────

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

  /** Push a freshly saved item into the local store state, merging if a duplicate exists. */
  async addItem(item: PantryItem): Promise<void> {
    try {
      const mergeTarget = await this.findMergeCandidate(item);
      if (mergeTarget) {
        const merged = this.mergeItemWithExisting(mergeTarget, item);
        await this.pantryQuery.saveItem(merged);
        return;
      }
      await this.pantryQuery.saveItem(item);
      this.reviewPrompt.handleProductAdded();
    } catch (err: any) {
      console.error('[PantryStoreService] addItem error', err);
      this.error.set('Failed to add item');
    }
  }

  /** Replace an existing item in the signal cache with its latest version. */
  async updateItem(item: PantryItem): Promise<void> {
    try {
      await this.pantryQuery.saveItem(item);
    } catch (err: any) {
      console.error('[PantryStoreService] updateItem error', err);
      this.error.set('Failed to update item');
    }
  }

  /** Remove an item from the local cache once deletion succeeds. */
  async deleteItem(id: string): Promise<void> {
    try {
      await this.pantryQuery.deleteItem(id);
    } catch (err: any) {
      console.error('[PantryStoreService] deleteItem error', err);
      this.error.set('Failed to delete item');
    }
  }

  /** Remove every expired item currently cached in the store. */
  async deleteExpiredItems(): Promise<void> {
    const expiredIds = this.expiredItems().map(item => item._id);
    if (!expiredIds.length) return;
    await Promise.all(expiredIds.map(id => this.deleteItem(id)));
  }

  /** Simple alias used by views to trigger a full reload. */
  async refresh(): Promise<void> {
    await this.loadAll();
  }

  // ─── Pagination / filter delegation ──────────────────────────────────────

  clearEntryFilters(): void {
    this.pantryQuery.clearEntryFilters();
  }

  applyPendingNavigationPreset(): void {
    this.pantryQuery.applyPendingNavigationPreset();
  }

  async ensureFirstPageLoaded(): Promise<void> {
    await this.pantryQuery.ensureFirstPageLoaded();
  }

  startBackgroundLoad(): void {
    this.pantryQuery.startBackgroundLoad();
  }

  setSearchQuery(value: string): void {
    this.pantryQuery.setSearchQuery(value);
  }

  setFilters(filters: Partial<PantryFilterState>): void {
    this.pantryQuery.setFilters(filters);
  }

  async addNewLot(
    itemId: string,
    params: { quantity: number; expiryDate?: string; location?: string; noExpiry?: boolean }
  ): Promise<PantryItem | null> {
    return this.pantryQuery.addNewLot(itemId, params);
  }

  // ─── Realtime sync ────────────────────────────────────────────────────────

  /** Bridge live database change events into the signal-based store. */
  watchRealtime(): void {
    if (this.realtimeSubscribed) return;
    this.realtimeSubscribed = true;
    this.pantryQuery.watchPantryChanges(() => {
      void this.logExpiredBatchEvents(this.items());
    });
  }

  // ─── Domain helpers (direct calls — no delegation chain) ──────────────────

  /** Sum every batch quantity into a single figure. */
  getItemTotalQuantity(item: PantryItem): number {
    return sumQuantities(item.batches ?? []);
  }

  /** Return the minimum threshold configured for the product. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return toNumberOrZero(item.minThreshold);
  }

  /** Earliest expiry date considering all batches. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return computeEarliestExpiry(item.batches ?? []);
  }

  /** Flatten and normalize all batches associated with an item. */
  getItemBatches(item: PantryItem) {
    return collectBatches(item.batches ?? [], { generateBatchId });
  }

  /** Determine whether any batch for the item is currently marked as opened. */
  hasItemOpenBatch(item: PantryItem): boolean {
    return hasOpenBatch(item);
  }

  /** Single source of truth for deciding whether an item should be auto-added to shopping list. */
  shouldAutoAddToShoppingList(
    item: PantryItem,
    context?: { totalQuantity?: number; minThreshold?: number | null }
  ): boolean {
    return shouldAutoAddToShoppingListDomain(item, context);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async findMergeCandidate(candidate: PantryItem): Promise<PantryItem | undefined> {
    const key = this.buildMergeKey(candidate);
    const localItems = this.items();

    if (key) {
      const localKeyMatch = localItems.find(item => this.buildMergeKey(item) === key);
      if (localKeyMatch) return localKeyMatch;
    }

    const persisted = await this.pantryQuery.getAll();
    if (key) return persisted.find(item => this.buildMergeKey(item) === key);
    return undefined;
  }

  private async logExpiredBatchEvents(items: PantryItem[]): Promise<void> {
    if (this.expiredScanInProgress) return;
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
    if (!name || !supermarket) return null;
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
