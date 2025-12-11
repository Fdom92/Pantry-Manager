import { effect, Injectable, signal } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID, NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { ExpirationStatus, ItemBatch, ItemLocationStock, MeasurementUnit, PantryItem } from '@core/models';
import { DEFAULT_PANTRY_FILTERS, PantryFilterState, PantrySortMode } from '@core/models/pantry-pipeline.model';
import { StorageService } from './storage.service';

type LegacyLocationStock = ItemLocationStock & { minThreshold?: number | null };

@Injectable({
  providedIn: 'root'
})
export class PantryService extends StorageService<PantryItem> {
  private readonly TYPE = 'item';
  readonly loadedProducts = signal<PantryItem[]>([]);
  readonly filteredProducts = signal<PantryItem[]>([]);
  readonly searchQuery = signal('');
  readonly activeFilters = signal<PantryFilterState>({ ...DEFAULT_PANTRY_FILTERS });
  readonly sortMode = signal<PantrySortMode>('name');
  readonly pageOffset = signal(0);
  readonly pageSize = signal(300);
  readonly loading = signal(false);
  readonly endReached = signal(false);
  readonly totalCount = signal(0);
  private currentLoadPromise: Promise<void> | null = null;
  private dbPreloaded = false;
  private productIndexReady = false;
  private pendingPipelineReset = false;
  private backgroundLoadPromise: Promise<void> | null = null;
  private readonly PRODUCT_INDEX_FIELDS: string[] = ['type'];

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

    if (this.currentLoadPromise) {
      await this.currentLoadPromise;
      if (this.loadedProducts().length > 0) {
        return;
      }
    }

    this.resetPagination();
    await this.loadNextPage(true);
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
          await this.loadNextPage(true);
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

  /** Return items that currently have stock in the requested location. */
  async getByLocation(locationId: string): Promise<PantryItem[]> {
    const all = await this.getAll();
    return all.filter(item =>
      item.locations.some(loc => loc.locationId === locationId)
    );
  }

  /** Retrieve items whose aggregated quantity is at or below the configured threshold. */
  async getLowStock(): Promise<PantryItem[]> {
    const items = await this.getAll();
  	return items.filter(item => this.isLowStock(item));
  }

  /** Retrieve items that have at least one location expiring within the provided window. */
  async getNearExpiry(daysAhead: number = 7): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => this.isNearExpiry(item, daysAhead));
  }

  /** Compute the overall expiration status based on the most urgent location expiry. */
  getExpirationStatus(item: PantryItem): ExpirationStatus {
    if (!item.locations.length) {
      return ExpirationStatus.OK;
    }
    return this.computeExpirationStatus(item.locations);
  }

  async deleteItem(id: string): Promise<boolean> {
    const ok = await this.remove(id);
    if (ok) {
      this.removeProductFromCache(id);
    }
    return ok;
  }

  /**
   * Update the quantity for a specific location entry, creating a placeholder if needed,
   * and then persist the refreshed document.
   */
  async updateLocationQuantity(itemId: string, quantity: number, locationId?: string): Promise<PantryItem | null> {
    const current = await this.get(itemId);
    if (!current) {
      return null;
    }

    const locations = [...(current.locations ?? [])];
    const targetId = locationId ?? locations[0]?.locationId;
    if (!targetId) {
      return null;
    }

    let handled = false;
    const nextLocations = locations.map(loc => {
      if (loc.locationId === targetId) {
        handled = true;
        const unit = this.normalizeUnitValue(loc.unit);
        const sanitizedBatches = this.normalizeBatches(loc.batches, unit);
        const nextTotal = Math.max(0, quantity);
        const adjustedBatches = this.applyQuantityDeltaToBatches(sanitizedBatches, nextTotal, unit);
        return {
          ...loc,
          unit,
          batches: adjustedBatches,
        };
      }
      return loc;
    });

    if (!handled) {
      const unit = this.normalizeUnitValue(locations[0]?.unit);
      const nextTotal = Math.max(0, quantity);
      nextLocations.push({
        locationId: targetId,
        unit,
        batches: this.applyQuantityDeltaToBatches([], nextTotal, unit),
      });
    }

    const updated: PantryItem = {
      ...current,
      locations: nextLocations,
    };

    return this.saveItem(updated);
  }

  /**
   * Append a brand new batch to the requested product/location without altering other batches.
   * If the location does not exist yet, it will be created.
   */
  async addNewLot(
    productId: string,
    lot: { quantity: number; expiryDate?: string | null; location: string; unit?: string }
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

    const locationId = (lot?.location ?? '').trim() || 'unassigned';
    const unit = this.normalizeUnitValue(
      lot?.unit ?? current.locations[0]?.unit ?? MeasurementUnit.UNIT
    );
    const expiryDate = lot?.expiryDate ?? undefined;

    const nextLocations = [...(current.locations ?? [])];
    const targetIndex = nextLocations.findIndex(loc => (loc.locationId ?? '').trim() === locationId);
    const newBatch: ItemBatch = {
      batchId: this.generateBatchId(),
      quantity,
      unit,
      expirationDate: expiryDate || undefined,
      opened: false,
    };

    if (targetIndex >= 0) {
      const target = nextLocations[targetIndex];
      const batches = this.normalizeBatches(target.batches, unit);
      const merged = this.mergeBatchesByExpiry([...batches, newBatch]);
      nextLocations[targetIndex] = {
        ...target,
        locationId,
        unit,
        batches: merged,
      };
    } else {
      nextLocations.push({
        locationId,
        unit,
        batches: this.mergeBatchesByExpiry([newBatch]),
      });
    }

    return this.saveItem({
      ...current,
      locations: nextLocations,
    });
  }

  /** Retrieve items that already have an expired location. */
  async getExpired(): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => this.isExpired(item));
  }

  /** Build a quick aggregate for dashboards without forcing callers to re-implement loops. */
  async getSummary(): Promise<{
    total: number;
    expired: number;
    nearExpiry: number;
    lowStock: number;
  }> {
    const items = await this.getAll();

    let expired = 0, nearExpiry = 0, lowStock = 0;

    for (const item of items) {
      if (this.isExpired(item)) {
        expired += 1;
      } else if (this.isNearExpiry(item)) {
        nearExpiry += 1;
      }
      if (this.isLowStock(item)) {
        lowStock += 1;
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
  async loadNextPage(isBackground = false): Promise<void> {
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

  /** Changes the local sort mode without touching the database. */
  setSortMode(mode: PantrySortMode): void {
    if (this.sortMode() === mode) {
      return;
    }
    this.sortMode.set(mode);
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
   * or sort mode change.
   */
  private recomputeFilteredProducts(): void {
    const loaded = this.loadedProducts();
    const query = this.searchQuery().toLowerCase();
    const filters = this.activeFilters();
    const mode = this.sortMode();

    const filtered = loaded.filter(item => {
      return this.matchesSearch(item, query) && this.matchesFilters(item, filters);
    });
    const sorted = this.sortItems(filtered, mode);
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
    if (filters.lowStock && !this.isLowStock(item)) {
      return false;
    }
    if (filters.expired && !this.isExpired(item)) {
      return false;
    }
    if (filters.expiring && (!this.isNearExpiry(item) || this.isExpired(item))) {
      return false;
    }
    if (filters.normalOnly && (this.isLowStock(item) || this.isExpired(item) || this.isNearExpiry(item))) {
      return false;
    }
    if (filters.categoryId !== null && filters.categoryId !== undefined && (item.categoryId ?? '') !== filters.categoryId) {
      return false;
    }
    if (
      filters.locationId !== null &&
      filters.locationId !== undefined &&
      !item.locations.some(loc => (loc.locationId ?? '') === filters.locationId)
    ) {
      return false;
    }
    return true;
  }

  private sortItems(items: PantryItem[], mode: PantrySortMode): PantryItem[] {
    if (items.length <= 1) {
      return items;
    }
    const sorted = [...items];
    sorted.sort((a, b) => this.compareItemsForSort(a, b, mode));
    return sorted;
  }

  private compareItemsForSort(a: PantryItem, b: PantryItem, mode: PantrySortMode): number {
    const expirationDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationDiff !== 0) {
      return expirationDiff;
    }

    switch (mode) {
      case 'quantity': {
        const quantityDiff = this.getItemTotalQuantity(b) - this.getItemTotalQuantity(a);
        if (quantityDiff !== 0) {
          return quantityDiff;
        }
        break;
      }
      case 'expiration': {
        const timeDiff = this.getExpirationTime(a) - this.getExpirationTime(b);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        break;
      }
      default:
        break;
    }

    const labelA = (a.name ?? '').toLowerCase();
    const labelB = (b.name ?? '').toLowerCase();
    return labelA.localeCompare(labelB);
  }

  private requestPipelineReset(): void {
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
    this.resetPagination();
    await this.loadAllPages();
  }

  private hasActiveFilters(filters: PantryFilterState = this.activeFilters()): boolean {
    return Boolean(
      filters.lowStock ||
      filters.expired ||
      filters.expiring ||
      filters.normalOnly ||
      filters.basic ||
      (filters.categoryId !== null && filters.categoryId !== undefined) ||
      (filters.locationId !== null && filters.locationId !== undefined)
    );
  }

  private hasSearchQuery(): boolean {
    return Boolean(this.searchQuery());
  }

  private areFiltersEqual(a: PantryFilterState, b: PantryFilterState): boolean {
    return (
      a.lowStock === b.lowStock &&
      a.expired === b.expired &&
      a.expiring === b.expiring &&
      a.normalOnly === b.normalOnly &&
      a.basic === b.basic &&
      (a.categoryId ?? null) === (b.categoryId ?? null) &&
      (a.locationId ?? null) === (b.locationId ?? null)
    );
  }

  /** --- Public helpers for store/UI logic reuse --- */
  /** Check whether the combined stock across locations is considered low. */
  isItemLowStock(item: PantryItem): boolean {
    return this.isLowStock(item);
  }

  /** Determine if any location expires within the provided rolling window. */
  isItemNearExpiry(item: PantryItem, daysAhead: number = NEAR_EXPIRY_WINDOW_DAYS): boolean {
    return this.isNearExpiry(item, daysAhead);
  }

  /** Determine if at least one location has already expired. */
  isItemExpired(item: PantryItem): boolean {
    return this.isExpired(item);
  }

  /** Sum every location quantity into a single figure. */
  getItemTotalQuantity(item: PantryItem): number {
    return item.locations.reduce((sum, loc) => sum + this.getLocationQuantity(loc), 0);
  }

  /** Return the minimum threshold configured for the product (legacy per-location sums are handled earlier). */
  getItemTotalMinThreshold(item: PantryItem): number {
    return this.toNumberOrUndefined(item.minThreshold) ?? 0;
  }

  /** Return the earliest expiry date among the defined locations. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return this.computeEarliestExpiry(item.locations);
  }

  private getExpirationWeight(item: PantryItem): number {
    if (this.isExpired(item)) {
      return 0;
    }
    if (this.isNearExpiry(item)) {
      return 1;
    }
    return 2;
  }

  private getExpirationTime(item: PantryItem): number {
    const expiry = this.computeEarliestExpiry(item.locations);
    if (!expiry) {
      return Number.MAX_SAFE_INTEGER;
    }
    return new Date(expiry).getTime();
  }

  /** Total quantity stored for a specific location id. */
  getItemQuantityByLocation(item: PantryItem, locationId: string): number {
    const target = (locationId ?? '').trim();
    if (!target) {
      return 0;
    }
    return item.locations
      .filter(loc => (loc.locationId ?? '').trim() === target)
      .reduce((sum, loc) => sum + this.getLocationQuantity(loc), 0);
  }

  /** Return all batches currently tracked for the provided item. */
  getItemBatches(item: PantryItem): ItemBatch[] {
    return this.collectBatches(item.locations);
  }

  /** Determine whether any batch in the item is marked as opened. */
  hasOpenBatch(item: PantryItem): boolean {
    return this.collectBatches(item.locations).some(batch => Boolean(batch.opened));
  }

  /** Compute aggregate fields without mutating the original payload. */
  private applyDerivedFields(item: PantryItem): PantryItem {
    const rawLocations = Array.isArray(item.locations) ? item.locations : [];
    const locations = this.normalizeLocations(rawLocations);
    const supermarket = this.normalizeSupermarketName(
      (item.supermarket ?? (item as any).supermarketId) as string | undefined
    );
    const minThreshold = this.normalizeItemMinThreshold(item.minThreshold, rawLocations as LegacyLocationStock[]);
    const prepared: PantryItem = {
      ...item,
      supermarket,
      locations,
      minThreshold,
      expirationDate: this.computeEarliestExpiry(locations),
      expirationStatus: this.computeExpirationStatus(locations),
    };
    delete (prepared as any).supermarketId;
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

  private normalizeLocations(locations?: ItemLocationStock[]): ItemLocationStock[] {
    const raw = Array.isArray(locations) ? locations.filter(Boolean) : [];
    const normalized = raw
      .map(location => this.normalizeLocation(location))
      .filter((loc): loc is ItemLocationStock => Boolean((loc.locationId ?? '').trim()));

    if (!normalized.length) {
      return [
        {
          locationId: 'unassigned',
          unit: MeasurementUnit.UNIT,
          batches: [],
        },
      ];
    }

    return normalized;
  }

  private normalizeItemMinThreshold(
    itemMinThreshold: number | undefined,
    rawLocations: LegacyLocationStock[]
  ): number | undefined {
    const normalizedValue = this.toNumberOrUndefined(itemMinThreshold);
    if (normalizedValue != null) {
      return normalizedValue;
    }

    const legacyTotal = rawLocations.reduce((sum, location) => {
      const legacyMin = this.toNumberOrUndefined(location?.minThreshold);
      return sum + (legacyMin ?? 0);
    }, 0);

    return legacyTotal > 0 ? legacyTotal : undefined;
  }

  private normalizeLocation(location: ItemLocationStock): ItemLocationStock {
    const unit = this.normalizeUnitValue(location.unit);
    const locationId = (location.locationId ?? 'unassigned').trim() || 'unassigned';
    const batches = this.normalizeBatches(location.batches, unit);
    const legacyQuantity = this.toNumberOrZero((location as any).quantity);
    const totalBatchQuantity = this.sumBatchQuantities(batches);

    if (legacyQuantity > 0 && totalBatchQuantity === 0) {
      batches.push({
        batchId: this.generateBatchId(),
        quantity: legacyQuantity,
        unit,
        opened: false,
      });
    }

    return {
      locationId,
      unit,
      batches,
    };
  }

  private normalizeBatches(batches: ItemBatch[] | undefined, fallbackUnit: MeasurementUnit | string): ItemBatch[] {
    if (!Array.isArray(batches) || !batches.length) {
      return [];
    }

    const normalized = batches.map(batch => ({
      ...batch,
      batchId: batch.batchId ?? this.generateBatchId(),
      quantity: this.toNumberOrZero(batch.quantity),
      unit: this.normalizeUnitValue(batch.unit ?? fallbackUnit),
      opened: batch.opened ?? false,
    }));

    return this.mergeBatchesByExpiry(normalized);
  }

  /** Merge batches that share the same expiration date so duplicate entries collapse automatically. */
  private mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
    if (batches.length <= 1) {
      return batches;
    }

    const seen = new Map<string, ItemBatch>();
    const merged: ItemBatch[] = [];

    for (const batch of batches) {
      const key = (batch.expirationDate ?? '').trim();
      if (!key) {
        merged.push(batch);
        continue;
      }

      const existing = seen.get(key);
      if (!existing) {
        const clone = { ...batch };
        seen.set(key, clone);
        merged.push(clone);
        continue;
      }

      existing.quantity = this.toNumberOrZero(existing.quantity) + this.toNumberOrZero(batch.quantity);
      existing.opened = Boolean(existing.opened || batch.opened);
    }

    return merged;
  }

  /** Identify the earliest expiry date across all location entries. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    const dates = this.collectBatches(locations)
      .map(batch => batch.expirationDate)
      .filter((date): date is string => Boolean(date));
    if (dates.length === 0) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
  }

  /** Project a high-level expiration status based on per-location dates. */
  private computeExpirationStatus(locations: ItemLocationStock[]): ExpirationStatus {
    const now = new Date();
    const windowDays = NEAR_EXPIRY_WINDOW_DAYS;
    let nearest: ExpirationStatus = ExpirationStatus.OK;

    for (const batch of this.collectBatches(locations)) {
      if (!batch.expirationDate) {
        continue;
      }
      const exp = new Date(batch.expirationDate);
      if (this.isExpiredDate(exp, now)) {
        return ExpirationStatus.EXPIRED;
      }
      if (nearest !== ExpirationStatus.NEAR_EXPIRY && this.isNearExpiryDate(exp, now, windowDays)) {
        nearest = ExpirationStatus.NEAR_EXPIRY;
      }
    }

    return nearest;
  }

  /** Internal low-stock detector that considers the sum of all locations. */
  private isLowStock(item: PantryItem): boolean {
    const totalMinThreshold = this.getItemTotalMinThreshold(item);
    if (totalMinThreshold <= 0) {
      return false;
    }
    return this.getItemTotalQuantity(item) < totalMinThreshold;
  }

  /** Internal near-expiry detector that checks every location. */
  private isNearExpiry(item: PantryItem, daysAhead: number = NEAR_EXPIRY_WINDOW_DAYS): boolean {
    const now = new Date();
    return this.collectBatches(item.locations).some(batch => {
      if (!batch.expirationDate) return false;
      const exp = new Date(batch.expirationDate);
      return !this.isExpiredDate(exp, now) && this.isNearExpiryDate(exp, now, daysAhead);
    });
  }

  /** Internal expired detector that checks every location. */
  private isExpired(item: PantryItem): boolean {
    const now = new Date();
    return this.collectBatches(item.locations).some(batch => {
      if (!batch.expirationDate) return false;
      const exp = new Date(batch.expirationDate);
      return this.isExpiredDate(exp, now);
    });
  }

  private isExpiredDate(expiration: Date, reference: Date): boolean {
    const exp = new Date(expiration);
    exp.setHours(0, 0, 0, 0);
    const ref = new Date(reference);
    ref.setHours(0, 0, 0, 0);
    return exp < ref;
  }

  /** Evaluate whether an expiry is within the provided window starting from today. */
  private isNearExpiryDate(expiration: Date, reference: Date, windowDays: number): boolean {
    const exp = new Date(expiration);
    exp.setHours(0, 0, 0, 0);
    const ref = new Date(reference);
    ref.setHours(0, 0, 0, 0);
    const diff = exp.getTime() - ref.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= windowDays;
  }

  private collectBatches(locations: ItemLocationStock[]): ItemBatch[] {
    const batches: ItemBatch[] = [];
    for (const location of locations) {
      if (!Array.isArray(location.batches)) {
        continue;
      }
      for (const batch of location.batches) {
        batches.push({
          ...batch,
          quantity: this.toNumberOrZero(batch.quantity),
          unit: this.normalizeUnitValue(batch.unit ?? location.unit),
          batchId: batch.batchId ?? this.generateBatchId(),
          opened: batch.opened ?? false,
        });
      }
    }
    return batches;
  }

  private normalizeUnitValue(unit: MeasurementUnit | string | undefined): string {
    if (typeof unit !== 'string') {
      return MeasurementUnit.UNIT;
    }
    const trimmed = unit.trim();
    if (!trimmed) {
      return MeasurementUnit.UNIT;
    }
    return trimmed;
  }

  private sumBatchQuantities(batches: ItemBatch[] | undefined): number {
    if (!Array.isArray(batches) || !batches.length) {
      return 0;
    }
    return batches.reduce((sum, batch) => sum + this.toNumberOrZero(batch.quantity), 0);
  }

  private applyQuantityDeltaToBatches(
    batches: ItemBatch[],
    nextTotal: number,
    fallbackUnit: MeasurementUnit | string
  ): ItemBatch[] {
    const sanitized: ItemBatch[] = batches.map(batch => ({
      ...batch,
      quantity: this.toNumberOrZero(batch.quantity),
      unit: this.normalizeUnitValue(batch.unit ?? fallbackUnit),
    }));
    const currentTotal = this.sumBatchQuantities(sanitized);
    const target = this.toNumberOrZero(nextTotal);

    if (target <= 0) {
      return [];
    }

    if (Math.abs(target - currentTotal) < 1e-9) {
      return sanitized;
    }

    if (currentTotal === 0) {
      return [
        {
          batchId: this.generateBatchId(),
          quantity: target,
          unit: this.normalizeUnitValue(fallbackUnit),
          opened: false,
        },
      ];
    }

    let delta = target - currentTotal;
    const adjusted = sanitized.map(batch => ({ ...batch }));

    if (delta > 0) {
      if (!adjusted.length) {
        adjusted.push({
          batchId: this.generateBatchId(),
          quantity: target,
          unit: this.normalizeUnitValue(fallbackUnit),
          opened: false,
        });
      } else {
        adjusted[0].quantity = this.toNumberOrZero(adjusted[0].quantity) + delta;
      }
      return adjusted;
    }

    delta = Math.abs(delta);
    for (let i = adjusted.length - 1; i >= 0 && delta > 0; i--) {
      const batchQty = this.toNumberOrZero(adjusted[i].quantity);
      if (batchQty <= delta + 1e-9) {
        delta -= batchQty;
        adjusted.splice(i, 1);
      } else {
        adjusted[i].quantity = batchQty - delta;
        delta = 0;
      }
    }

    if (delta > 0) {
      return [];
    }

    return adjusted;
  }

  private getLocationQuantity(location: ItemLocationStock): number {
    if (!Array.isArray(location.batches) || location.batches.length === 0) {
      return 0;
    }
    return location.batches.reduce((sum, batch) => sum + this.toNumberOrZero(batch.quantity), 0);
  }

  private toNumberOrZero(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
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
