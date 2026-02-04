import { computed, effect, Injectable, signal } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID, NEAR_EXPIRY_WINDOW_DAYS, RECENTLY_ADDED_WINDOW_DAYS, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import {
  collectBatches as collectBatchesItem,
  computeExpirationStatus as computeExpirationStatusItem,
  getItemStatusState,
  getItemEarliestExpiry as getItemEarliestExpiryItem,
  getItemTotalMinThreshold as getItemTotalMinThresholdItem,
  getItemTotalQuantity as getItemTotalQuantityItem,
  hasOpenBatch as hasOpenBatchItem,
  shouldAutoAddToShoppingList as shouldAutoAddToShoppingListItem,
} from '@core/domain/pantry/pantry-item';
import {
  computeEarliestExpiry as computeEarliestExpiryStock,
  mergeBatchesByExpiry as mergeBatchesByExpiryStock,
  normalizeBatches as normalizeBatchesStock,
  toNumberOrZero as toNumberOrZeroStock,
} from '@core/domain/pantry/pantry-stock';
import { DEFAULT_PANTRY_FILTERS, ItemBatch, PantryFilterState, PantryItem } from '@core/models/pantry';
import { ExpirationStatus, MeasurementUnit } from '@core/models/shared';
import { normalizeLocationId, normalizeUnitValue } from '@core/utils/normalization.util';
import { StorageService } from '../shared/storage.service';
import type PouchDB from 'pouchdb-browser';

@Injectable({
  providedIn: 'root'
})
export class PantryService extends StorageService<PantryItem> {
  // DATA
  private readonly TYPE = 'item';
  private currentLoadPromise: Promise<void> | null = null;
  private dbPreloaded = false;
  private productIndexReady = false;
  private pendingPipelineReset = false;
  private backgroundLoadPromise: Promise<void> | null = null;
  private readonly PRODUCT_INDEX_FIELDS: string[] = ['type'];
  // SIGNALS
  readonly loadedProducts = signal<PantryItem[]>([]);
  readonly activeProducts = computed(() => this.loadedProducts().filter(item => this.hasStock(item)));
  readonly filteredProducts = signal<PantryItem[]>([]);
  readonly searchQuery = signal('');
  readonly activeFilters = signal<PantryFilterState>({ ...DEFAULT_PANTRY_FILTERS });
  readonly pageOffset = signal(0);
  readonly pageSize = signal(300);
  readonly loading = signal(false);
  readonly pipelineResetting = signal(false);
  readonly endReached = signal(false);
  readonly totalCount = signal(0);
  private readonly pendingNavigationPreset = signal<Partial<PantryFilterState> | null>(null);

  constructor() {
    super();
    effect(() => {
      this.recomputeFilteredProducts();
    });
  }

  /**
   * Warms up the database during bootstrap to eliminate the initial lag and
   * ensures the index required by paginated queries is available.
   */
  async initialize(): Promise<void> {
    if (this.dbPreloaded) {
      return;
    }
    this.dbPreloaded = true;
    try {
      await this.database.info();
      await this.ensureProductIndex();
      await this.refreshTotalCount();
    } catch (err) {
      console.warn('[PantryService] Database warmup failed', err);
      this.dbPreloaded = false;
    }
  }

  /** Clears pagination state and wipes the cached product batches. */
  resetPagination(): void {
    this.pageOffset.set(0);
    this.loadedProducts.set([]);
    this.filteredProducts.set([]);
    this.endReached.set(false);
  }

  /** Reloads from the beginning by fetching the first full page from PouchDB. */
  async reloadFromStart(): Promise<void> {
    this.resetPagination();
    await this.loadAllPages();
  }

  /** Ensure at least one page is available to render something immediately. */
  async ensureFirstPageLoaded(): Promise<void> {
    if (this.loadedProducts().length > 0) {
      return;
    }

    if (this.endReached() && !this.pipelineResetting()) {
      return;
    }

    if (this.currentLoadPromise) {
      await this.currentLoadPromise;
      if (this.loadedProducts().length > 0) {
        return;
      }
    }

    this.resetPagination();
    await this.loadNextPage();
  }

  /** Continue loading remaining pages without blocking the UI. */
  startBackgroundLoad(): void {
    if (this.backgroundLoadPromise || this.endReached()) {
      return;
    }
    this.backgroundLoadPromise = (async () => {
      try {
        await this.ensureFirstPageLoaded();
        while (!this.endReached()) {
          await this.loadNextPage();
        }
      } catch (err) {
        console.warn('[PantryService] background load failed', err);
      } finally {
        this.backgroundLoadPromise = null;
      }
    })();
  }

  /**
   * Fetches a page of normalized products using skip/limit.
   * @param offset Starting position (0 for the first page)
   * @param limit Batch size to retrieve
   */
  async getPaginatedProducts(offset: number, limit: number): Promise<PantryItem[]> {
    if (limit <= 0) {
      return [];
    }
    await this.ensureProductIndex();
    const response = await this.database.find({
      selector: { type: this.TYPE },
      skip: Math.max(0, offset),
      limit,
    });
    return response.docs.map(doc => this.applyDerivedFields(doc));
  }

  /** Persist an item ensuring aggregate fields (type, household, expirations) stay in sync. */
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const prepared = this.applyDerivedFields({
      ...item,
      type: this.TYPE,
      householdId: item.householdId ?? DEFAULT_HOUSEHOLD_ID,
    });
    const saved = await this.upsert(prepared);
    const normalized = this.applyDerivedFields(saved);
    this.replaceProductInCache(normalized);
    return normalized;
  }

  /** Fetch every pantry item, computing aggregate fields directly from stored data. */
  async getAll(): Promise<PantryItem[]> {
    const docs = await this.listByType(this.TYPE);
    return docs.map(doc => this.applyDerivedFields(doc));
  }

  /** Fetch every pantry item that currently has stock. */
  async getAllActive(): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => this.hasStock(item));
  }

  async deleteItem(id: string): Promise<boolean> {
    const ok = await this.remove(id);
    if (ok) {
      this.removeProductFromCache(id);
    }
    return ok;
  }

  /**
   * Append a brand new batch to the requested product without altering other batches.
   * If a location is provided, it will be normalized and stored on the batch.
   */
  async addNewLot(
    productId: string,
    lot: { quantity: number; expiryDate?: string | null; location?: string; unit?: string }
  ): Promise<PantryItem | null> {
    const item = await this.get(productId);
    if (!item) {
      return null;
    }

    const current = this.applyDerivedFields(item);
    const quantity = this.toNumberOrZero(lot?.quantity);
    if (quantity <= 0) {
      return current;
    }

    const rawLocation = (lot?.location ?? '').trim();
    const locationId = rawLocation ? normalizeLocationId(rawLocation, UNASSIGNED_LOCATION_KEY) : undefined;
    const unit = normalizeUnitValue(lot?.unit ?? current.batches[0]?.unit ?? MeasurementUnit.UNIT);
    const expiryDate = lot?.expiryDate ?? undefined;

    const newBatch: ItemBatch = {
      batchId: this.generateBatchId(),
      quantity,
      unit,
      expirationDate: expiryDate || undefined,
      opened: false,
      locationId,
    };

    return this.saveItem({
      ...current,
      batches: this.mergeBatchesByExpiry([...(current.batches ?? []), newBatch]),
    });
  }

  /** Build a quick aggregate for dashboards without forcing callers to re-implement loops. */
  async getSummary(): Promise<{
    total: number;
    expired: number;
    nearExpiry: number;
    lowStock: number;
  }> {
    const items = await this.getAllActive();
    const now = new Date();

    let expired = 0, nearExpiry = 0, lowStock = 0;

    for (const item of items) {
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      switch (state) {
        case 'expired':
          expired += 1;
          break;
        case 'near-expiry':
          nearExpiry += 1;
          break;
        case 'low-stock':
          lowStock += 1;
          break;
        default:
          break;
      }
    }

    return {
      total: items.length,
      expired,
      nearExpiry,
      lowStock
    };
  }

  /** Subscribe to live-updates while ensuring consumers always see consistent payloads. */
  watchPantryChanges(onChange: (item: PantryItem | null, meta?: { deleted?: boolean; id: string }) => void) {
    return this.watchChanges(doc => {
      if (doc.type !== this.TYPE) {
        return;
      }
      const deleted = (doc as any)._deleted === true;
      if (deleted) {
        this.removeProductFromCache(doc._id);
        onChange(null, { deleted: true, id: doc._id });
        return;
      }
      const normalized = this.applyDerivedFields(doc);
      this.replaceProductInCache(normalized);
      onChange(normalized, { id: doc._id });
    });
  }

  /**
   * Loads the next raw page from PouchDB using skip/limit.
   * It never applies filters or sorting here; the reactive pipeline handles that in memory.
   */
  async loadNextPage(): Promise<void> {
    if (this.loading()) {
      return this.currentLoadPromise ?? Promise.resolve();
    }

    if (this.endReached()) {
      return;
    }

    const limit = this.pageSize();
    if (limit <= 0) {
      return;
    }

    const loadPromise = (async () => {
      this.loading.set(true);
      try {
        await this.initialize();
        const offset = this.pageOffset();
        const docs = await this.getPaginatedProducts(offset, limit);
        if (docs.length) {
          this.appendBatchToLoadedProducts(docs);
          this.pageOffset.update(value => value + docs.length);
        } else if (offset === 0) {
          this.loadedProducts.set([]);
          this.filteredProducts.set([]);
        }
        if (docs.length < limit) {
          this.endReached.set(true);
        }
      } finally {
        this.loading.set(false);
      }

      if (this.pendingPipelineReset) {
        await this.performPendingPipelineReset();
      }
    })();

    this.currentLoadPromise = loadPromise;

    try {
      await loadPromise;
    } finally {
      if (this.currentLoadPromise === loadPromise) {
        this.currentLoadPromise = null;
      }
    }
  }

  /** Updates the global search term and restarts pagination so results reload from the beginning. */
  setSearchQuery(raw: string): void {
    const normalized = (raw ?? '').trim();
    if (this.searchQuery() === normalized) {
      return;
    }
    this.searchQuery.set(normalized);
    this.requestPipelineReset();
  }

  /** Updates a single filter entry and restarts the paginated load. */
  setFilter<K extends keyof PantryFilterState>(key: K, value: PantryFilterState[K]): void {
    this.setFilters({ [key]: value } as Partial<PantryFilterState>);
  }

  /** Allows batching multiple filter updates in one call. */
  setFilters(updates: Partial<PantryFilterState>): void {
    const current = this.activeFilters();
    const next = { ...current, ...updates };
    if (this.areFiltersEqual(current, next)) {
      return;
    }
    this.activeFilters.set(next);
    this.requestPipelineReset();
  }

  /** Resets filters and search text, forcing a fresh load from the start. */
  resetSearchAndFilters(): void {
    const hasSearch = Boolean(this.searchQuery());
    const currentFilters = this.activeFilters();
    const filtersChanged = !this.areFiltersEqual(currentFilters, DEFAULT_PANTRY_FILTERS);
    if (!hasSearch && !filtersChanged) {
      return;
    }
    this.searchQuery.set('');
    this.activeFilters.set({ ...DEFAULT_PANTRY_FILTERS });
    this.requestPipelineReset();
  }

  /**
   * Stores a one-shot preset to be applied by the pantry page on entry.
   * This avoids mutating the shared pantry cache (and other views) before navigation completes.
   */
  setPendingNavigationPreset(preset: Partial<PantryFilterState>): void {
    this.pendingNavigationPreset.set(preset);
  }

  /**
   * Clears search/filters on pantry entry unless a dashboard preset is pending.
   * This is a UX helper to ensure the pantry tab opens in a consistent state.
   */
  clearEntryFilters(): void {
    if (this.pendingNavigationPreset()) {
      return;
    }

    const defaultFilters: PantryFilterState = { ...DEFAULT_PANTRY_FILTERS };
    const searchChanged = Boolean(this.searchQuery());
    const filtersChanged = !this.areFiltersEqual(this.activeFilters(), defaultFilters);

    if (!searchChanged && !filtersChanged) {
      return;
    }

    if (searchChanged) {
      this.searchQuery.set('');
    }
    if (filtersChanged) {
      this.activeFilters.set(defaultFilters);
    }
  }

  /** Applies and clears any pending navigation preset. */
  applyPendingNavigationPreset(): void {
    const preset = this.pendingNavigationPreset();
    if (!preset) {
      return;
    }
    this.pendingNavigationPreset.set(null);
    this.applyNavigationPreset(preset);
  }

  private applyNavigationPreset(preset: Partial<PantryFilterState>): void {
    const nextFilters: PantryFilterState = { ...DEFAULT_PANTRY_FILTERS, ...preset };
    const searchChanged = Boolean(this.searchQuery());
    const filtersChanged = !this.areFiltersEqual(this.activeFilters(), nextFilters);

    if (!searchChanged && !filtersChanged) {
      return;
    }

    if (searchChanged) {
      this.searchQuery.set('');
    }
    if (filtersChanged) {
      this.activeFilters.set(nextFilters);
    }
    this.requestPipelineReset();
  }

  /** --- Public helpers for store/UI logic reuse --- */
  /** Sum every batch quantity into a single figure. */
  getItemTotalQuantity(item: PantryItem): number {
    return getItemTotalQuantityItem(item);
  }

  /** Return the minimum threshold configured for the product (legacy handling happens during migration). */
  getItemTotalMinThreshold(item: PantryItem): number {
    return getItemTotalMinThresholdItem(item);
  }

  /** Return the earliest expiry date among the defined batches. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return getItemEarliestExpiryItem(item);
  }

  /** Return all batches currently tracked for the provided item. */
  getItemBatches(item: PantryItem): ItemBatch[] {
    return collectBatchesItem(item.batches ?? [], { generateBatchId: this.generateBatchId.bind(this) });
  }

  /** Determine whether any batch in the item is marked as opened. */
  hasOpenBatch(item: PantryItem): boolean {
    return hasOpenBatchItem(item);
  }

  /** Decide if the item should appear automatically in the shopping list. */
  shouldAutoAddToShoppingList(
    item: PantryItem,
    context?: { totalQuantity?: number; minThreshold?: number | null }
  ): boolean {
    return shouldAutoAddToShoppingListItem(item, context);
  }

  private async refreshTotalCount(): Promise<void> {
    try {
      const total = await this.countByType(this.TYPE);
      this.totalCount.set(total);
    } catch (err) {
      console.warn('[PantryService] Failed to refresh total count', err);
    }
  }

  /**
   * Recomputes the filtered list whenever the raw items, search term, filters,
   * or sorting rules change.
   */
  private recomputeFilteredProducts(): void {
    const loaded = this.activeProducts();
    const query = this.searchQuery().toLowerCase();
    const filters = this.activeFilters();

    const filtered = loaded.filter(item => {
      return this.hasStock(item) && this.matchesSearch(item, query) && this.matchesFilters(item, filters);
    });
    const sorted = this.sortItems(filtered);
    this.filteredProducts.set(sorted);
  }

  private matchesSearch(item: PantryItem, query: string): boolean {
    const normalized = query.trim();
    if (!normalized) {
      return true;
    }
    const name = (item.name ?? '').toLowerCase();
    return name.includes(normalized);
  }

  private matchesFilters(item: PantryItem, filters: PantryFilterState): boolean {
    if (filters.basic && !item.isBasic) {
      return false;
    }
    const state = getItemStatusState(item, new Date(), NEAR_EXPIRY_WINDOW_DAYS);
    if (filters.expired && state !== 'expired') {
      return false;
    }
    if (filters.expiring && state !== 'near-expiry') {
      return false;
    }
    if (filters.lowStock && state !== 'low-stock') {
      return false;
    }
    if (filters.recentlyAdded && !this.isRecentlyAdded(item)) {
      return false;
    }
    if (filters.normalOnly && state !== 'normal') {
      return false;
    }
    return true;
  }

  private hasStock(item: PantryItem): boolean {
    return this.getItemTotalQuantity(item) > 0;
  }

  private sortItems(items: PantryItem[]): PantryItem[] {
    if (items.length <= 1) {
      return items;
    }
    const sorted = [...items];
    sorted.sort((a, b) => this.compareItemsForSort(a, b));
    return sorted;
  }

  private compareItemsForSort(a: PantryItem, b: PantryItem): number {
    const expirationDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationDiff !== 0) {
      return expirationDiff;
    }

    const labelA = (a.name ?? '').toLowerCase();
    const labelB = (b.name ?? '').toLowerCase();
    return labelA.localeCompare(labelB);
  }

  private requestPipelineReset(): void {
    this.pipelineResetting.set(true);
    this.pendingPipelineReset = true;
    if (!this.loading()) {
      void this.performPendingPipelineReset();
    }
  }

  private async performPendingPipelineReset(): Promise<void> {
    if (!this.pendingPipelineReset) {
      return;
    }
    this.pendingPipelineReset = false;
    try {
      this.resetPagination();
      await this.loadAllPages();
    } finally {
      this.pipelineResetting.set(false);
    }
  }

  private areFiltersEqual(a: PantryFilterState, b: PantryFilterState): boolean {
    return (
      a.lowStock === b.lowStock &&
      a.expired === b.expired &&
      a.expiring === b.expiring &&
      a.recentlyAdded === b.recentlyAdded &&
      a.normalOnly === b.normalOnly &&
      a.basic === b.basic
    );
  }

  private isRecentlyAdded(item: PantryItem): boolean {
    const createdAt = new Date(item?.createdAt ?? '');
    if (Number.isNaN(createdAt.getTime())) {
      return false;
    }
    const windowMs = RECENTLY_ADDED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - createdAt.getTime() <= windowMs;
  }

  private getExpirationWeight(item: PantryItem): number {
    switch (getItemStatusState(item, new Date(), NEAR_EXPIRY_WINDOW_DAYS)) {
      case 'expired':
        return 0;
      case 'near-expiry':
        return 1;
      case 'low-stock':
        return 2;
      default:
        return 3;
    }
  }

  /** Compute aggregate fields without mutating the original payload. */
  private applyDerivedFields(item: PantryItem): PantryItem {
    const rawBatches = Array.isArray(item.batches) ? item.batches : [];
    const fallbackUnit = normalizeUnitValue(
      rawBatches.find(batch => Boolean(batch?.unit))?.unit ?? MeasurementUnit.UNIT
    );
    const batches = this.normalizeBatches(rawBatches, fallbackUnit);
    const supermarket = this.normalizeSupermarketName(
      (item.supermarket ?? (item as any).supermarketId) as string | undefined
    );
    const minThreshold = this.toNumberOrUndefined(item.minThreshold);
    const prepared: PantryItem = {
      ...item,
      supermarket,
      batches,
      minThreshold,
      expirationDate: this.computeEarliestExpiry(batches),
      expirationStatus: this.computeExpirationStatus(batches),
    };
    delete (prepared as any).supermarketId;
    delete (prepared as any).locations;
    return prepared;
  }

  private normalizeSupermarketName(raw?: string | null): string | undefined {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      return undefined;
    }
    const normalizedWhitespace = trimmed.replace(/\s+/g, ' ');
    const lower = normalizedWhitespace.toLowerCase();
    return lower.replace(/\b\w/g, char => char.toUpperCase());
  }

  getMigrationDatabase(): PouchDB.Database<PantryItem> {
    return this.database;
  }

  private normalizeBatches(batches: ItemBatch[] | undefined, fallbackUnit: MeasurementUnit | string): ItemBatch[] {
    return normalizeBatchesStock(batches, fallbackUnit, {
      generateBatchId: this.generateBatchId.bind(this),
    });
  }

  /** Merge batches that share the same expiration date so duplicate entries collapse automatically. */
  private mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
    return mergeBatchesByExpiryStock(batches);
  }

  /** Identify the earliest expiry date across all batches. */
  private computeEarliestExpiry(batches: ItemBatch[]): string | undefined {
    return computeEarliestExpiryStock(batches);
  }

  /** Project a high-level expiration status based on batch dates. */
  private computeExpirationStatus(batches: ItemBatch[]): ExpirationStatus {
    return computeExpirationStatusItem(batches, new Date(), NEAR_EXPIRY_WINDOW_DAYS);
  }

  private toNumberOrZero(value: unknown): number {
    return toNumberOrZeroStock(value);
  }

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (value == null || value === '') {
      return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private generateBatchId(): string {
    return `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async ensureProductIndex(): Promise<void> {
    if (this.productIndexReady) {
      return;
    }
    await this.ensureIndex(this.PRODUCT_INDEX_FIELDS);
    this.productIndexReady = true;
  }

  /** Adds or replaces freshly loaded documents while preserving the cached order. */
  private appendBatchToLoadedProducts(batch: PantryItem[]): void {
    if (!batch.length) {
      return;
    }
    this.loadedProducts.update(items => {
      if (!items.length) {
        return [...batch];
      }
      const next = [...items];
      const indexById = new Map<string, number>();
      next.forEach((item, idx) => indexById.set(item._id, idx));
      for (const doc of batch) {
        const existingIndex = indexById.get(doc._id);
        if (existingIndex != null) {
          next[existingIndex] = doc;
        } else {
          indexById.set(doc._id, next.length);
          next.push(doc);
        }
      }
      return next;
    });
  }

  /** Updates the reactive cache with a freshly modified document to avoid broad re-queries. */
  private replaceProductInCache(item: PantryItem): void {
    let added = false;
    this.loadedProducts.update(items => {
      const index = items.findIndex(existing => existing._id === item._id);
      if (index < 0) {
        added = true;
        return [item, ...items];
      }
      const next = [...items];
      next[index] = item;
      return next;
    });
    if (added) {
      this.incrementTotalCount();
    }
  }

  /** Removes a product from the paginated cache when it gets deleted via UI or sync. */
  private removeProductFromCache(id: string): void {
    if (!id) {
      return;
    }
    let removed = false;
    this.loadedProducts.update(items => {
      const next = items.filter(item => item._id !== id);
      removed = next.length !== items.length;
      return next;
    });
    if (removed) {
      this.decrementTotalCount();
    }
  }

  private incrementTotalCount(delta: number = 1): void {
    this.totalCount.update(count => count + delta);
  }

  private decrementTotalCount(delta: number = 1): void {
    this.totalCount.update(count => Math.max(0, count - delta));
  }

  private async loadAllPages(): Promise<void> {
    while (!this.endReached()) {
      await this.loadNextPage();
    }
  }
}
