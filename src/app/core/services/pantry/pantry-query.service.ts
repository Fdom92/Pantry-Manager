import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { DEFAULT_PANTRY_PAGE_SIZE } from '@core/constants';
import {
  matchesFilters,
  matchesSearchQuery,
  sortPantryItems,
  sumQuantities,
} from '@core/domain/pantry';
import { DEFAULT_PANTRY_FILTERS } from '@core/models/pantry';
import type { PantryFilterState, PantryItem } from '@core/models/pantry';
import { normalizeSearchQuery } from '@core/utils/normalization.util';
import { PantryNavigationPresetService } from './pantry-navigation-preset.service';
import { PantryService } from './pantry.service';

/**
 * Reactive state layer for the pantry feature.
 *
 * Owns: in-memory item cache, pagination state, filter/search state,
 * and navigation preset application.
 * Delegates: all PouchDB I/O to PantryService.
 *
 * Root-scoped so the signal graph persists across page navigations.
 */
@Injectable({ providedIn: 'root' })
export class PantryQueryService {
  private readonly pantryService = inject(PantryService);
  private readonly navigationPreset = inject(PantryNavigationPresetService);

  private dbInitialized = false;
  private currentLoadPromise: Promise<void> | null = null;
  private pendingPipelineReset = false;
  private backgroundLoadPromise: Promise<void> | null = null;

  // ─── Reactive state ──────────────────────────────────────────────────────

  readonly loadedProducts = signal<PantryItem[]>([]);

  /** Items actually visible: fresh always shown; pantry items only when qty > 0. */
  readonly activeProducts = computed(() =>
    this.loadedProducts().filter(item =>
      item.productType === 'fresh' || sumQuantities(item.batches ?? []) > 0
    )
  );

  readonly filteredProducts = signal<PantryItem[]>([]);
  readonly searchQuery = signal('');
  readonly activeFilters = signal<PantryFilterState>({ ...DEFAULT_PANTRY_FILTERS });
  readonly pageOffset = signal(0);
  readonly pageSize = signal(DEFAULT_PANTRY_PAGE_SIZE);
  readonly loading = signal(false);
  readonly pipelineResetting = signal(false);
  readonly endReached = signal(false);
  readonly totalCount = signal(0);

  constructor() {
    effect(() => {
      this.recomputeFilteredProducts();
    });
  }

  // ─── Initialization / Pagination ──────────────────────────────────────────

  /**
   * Warms up the database and sets the initial total count.
   * Idempotent — safe to call on every loadNextPage() invocation.
   */
  async initialize(): Promise<void> {
    if (this.dbInitialized) return;
    this.dbInitialized = true;
    try {
      await this.pantryService.initialize();
      const total = await this.pantryService.getTotalCount();
      this.totalCount.set(total);
    } catch (err) {
      console.warn('[PantryQueryService] init failed', err);
      this.dbInitialized = false;
    }
  }

  /** Clears pagination state and wipes the cached product batches. */
  resetPagination(): void {
    this.pageOffset.set(0);
    this.loadedProducts.set([]);
    this.filteredProducts.set([]);
    this.endReached.set(false);
  }

  /** Reloads from the beginning by fetching all pages fresh from PouchDB. */
  async reloadFromStart(): Promise<void> {
    this.resetPagination();
    await this.loadAllPages();
  }

  /** Ensures at least one page is available to render something immediately. */
  async ensureFirstPageLoaded(): Promise<void> {
    if (this.loadedProducts().length > 0) return;
    if (this.endReached() && !this.pipelineResetting()) return;
    if (this.currentLoadPromise) {
      await this.currentLoadPromise;
      if (this.loadedProducts().length > 0) return;
    }
    this.resetPagination();
    await this.loadNextPage();
  }

  /** Continues loading remaining pages without blocking the UI. */
  startBackgroundLoad(): void {
    if (this.backgroundLoadPromise || this.endReached()) return;
    this.backgroundLoadPromise = (async () => {
      try {
        await this.ensureFirstPageLoaded();
        while (!this.endReached()) {
          await this.loadNextPage();
        }
      } catch (err) {
        console.warn('[PantryQueryService] background load failed', err);
      } finally {
        this.backgroundLoadPromise = null;
      }
    })();
  }

  /**
   * Fetches the next page from PouchDB and appends it to the cache.
   * Filters and sorting are applied reactively in memory via effect.
   */
  async loadNextPage(): Promise<void> {
    if (this.loading()) return this.currentLoadPromise ?? Promise.resolve();
    if (this.endReached()) return;
    const limit = this.pageSize();
    if (limit <= 0) return;

    const loadPromise = (async () => {
      this.loading.set(true);
      try {
        await this.initialize();
        const offset = this.pageOffset();
        const docs = await this.pantryService.getPaginatedProducts(offset, limit);
        if (docs.length) {
          this.appendBatchToLoadedProducts(docs);
          this.pageOffset.update(v => v + docs.length);
        } else if (offset === 0) {
          this.loadedProducts.set([]);
          this.filteredProducts.set([]);
        }
        if (docs.length < limit) this.endReached.set(true);
      } finally {
        this.loading.set(false);
      }
      if (this.pendingPipelineReset) await this.performPendingPipelineReset();
    })();

    this.currentLoadPromise = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (this.currentLoadPromise === loadPromise) this.currentLoadPromise = null;
    }
  }

  // ─── Cache-aware DB wrappers ──────────────────────────────────────────────

  /**
   * Persists an item and immediately reflects the change in the reactive cache.
   * Use PantryService.saveItem directly only when the cache should not be updated
   * (e.g. migration that is followed by a full reload).
   */
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const saved = await this.pantryService.saveItem(item);
    this.replaceProductInCache(saved);
    return saved;
  }

  /** Removes an item from DB and evicts it from the reactive cache. */
  async deleteItem(id: string): Promise<boolean> {
    const ok = await this.pantryService.deleteItem(id);
    if (ok) this.removeProductFromCache(id);
    return ok;
  }

  /** Appends a new lot to an item and keeps the cache up-to-date. */
  async addNewLot(
    productId: string,
    lot: { quantity: number; expiryDate?: string | null; location?: string; noExpiry?: boolean }
  ): Promise<PantryItem | null> {
    const saved = await this.pantryService.addNewLot(productId, lot);
    if (saved) this.replaceProductInCache(saved);
    return saved;
  }

  /**
   * Subscribes to live PouchDB changes.
   * The cache is updated automatically before `onChange` is called.
   */
  watchPantryChanges(
    onChange: (item: PantryItem | null, meta?: { deleted?: boolean; id: string }) => void
  ) {
    return this.pantryService.watchPantryChanges((item, meta) => {
      if (meta?.deleted && meta.id) {
        this.removeProductFromCache(meta.id);
      } else if (item) {
        this.replaceProductInCache(item);
      }
      onChange(item, meta);
    });
  }

  /** Fetch all pantry items from PouchDB (bypasses cache). */
  getAll(): Promise<PantryItem[]> {
    return this.pantryService.getAll();
  }

  /** Fetch all pantry items that currently have stock (bypasses cache). */
  getAllActive(): Promise<PantryItem[]> {
    return this.pantryService.getAllActive();
  }

  /** Build a quick aggregate of pantry status counts. */
  getSummary(): Promise<{ total: number; expired: number; nearExpiry: number; lowStock: number }> {
    return this.pantryService.getSummary();
  }

  // ─── Filter / search ──────────────────────────────────────────────────────

  /** Updates the global search term and triggers a pipeline reset. */
  setSearchQuery(raw: string): void {
    const normalized = normalizeSearchQuery(raw ?? '');
    if (this.searchQuery() === normalized) return;
    this.searchQuery.set(normalized);
    this.requestPipelineReset();
  }

  /** Updates a single filter entry and restarts the paginated load. */
  setFilter<K extends keyof PantryFilterState>(key: K, value: PantryFilterState[K]): void {
    this.setFilters({ [key]: value } as Partial<PantryFilterState>);
  }

  /** Batch multiple filter updates into one call. */
  setFilters(updates: Partial<PantryFilterState>): void {
    const current = this.activeFilters();
    const next = { ...current, ...updates };
    if (this.areFiltersEqual(current, next)) return;
    this.activeFilters.set(next);
    this.requestPipelineReset();
  }

  /** Resets filters and search text, forcing a fresh load from the start. */
  resetSearchAndFilters(): void {
    const hasSearch = Boolean(this.searchQuery());
    const filtersChanged = !this.areFiltersEqual(this.activeFilters(), DEFAULT_PANTRY_FILTERS);
    if (!hasSearch && !filtersChanged) return;
    this.searchQuery.set('');
    this.activeFilters.set({ ...DEFAULT_PANTRY_FILTERS });
    this.requestPipelineReset();
  }

  // ─── Navigation presets ───────────────────────────────────────────────────

  /**
   * Clears search/filters on pantry entry unless a navigation preset is pending.
   * Ensures the pantry tab opens in a consistent state.
   */
  clearEntryFilters(): void {
    if (this.navigationPreset.peek()) return;
    const defaultFilters: PantryFilterState = { ...DEFAULT_PANTRY_FILTERS };
    const searchChanged = Boolean(this.searchQuery());
    const filtersChanged = !this.areFiltersEqual(this.activeFilters(), defaultFilters);
    if (!searchChanged && !filtersChanged) return;
    if (searchChanged) this.searchQuery.set('');
    if (filtersChanged) this.activeFilters.set(defaultFilters);
  }

  /** Applies and clears any pending navigation preset. */
  applyPendingNavigationPreset(): void {
    const preset = this.navigationPreset.consume();
    if (!preset) return;
    this.applyNavigationPreset(preset);
  }

  private applyNavigationPreset(preset: Partial<PantryFilterState>): void {
    const nextFilters: PantryFilterState = { ...DEFAULT_PANTRY_FILTERS, ...preset };
    const searchChanged = Boolean(this.searchQuery());
    const filtersChanged = !this.areFiltersEqual(this.activeFilters(), nextFilters);
    if (!searchChanged && !filtersChanged) return;
    if (searchChanged) this.searchQuery.set('');
    if (filtersChanged) this.activeFilters.set(nextFilters);
    this.requestPipelineReset();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private recomputeFilteredProducts(): void {
    const loaded = this.activeProducts();
    const query = normalizeSearchQuery(this.searchQuery());
    const filters = this.activeFilters();
    const filtered = loaded.filter(item =>
      matchesSearchQuery(item, query) && matchesFilters(item, filters)
    );
    this.filteredProducts.set(sortPantryItems(filtered));
  }

  private requestPipelineReset(): void {
    this.pipelineResetting.set(true);
    this.pendingPipelineReset = true;
    if (!this.loading()) void this.performPendingPipelineReset();
  }

  private async performPendingPipelineReset(): Promise<void> {
    if (!this.pendingPipelineReset) return;
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
      a.review === b.review &&
      a.pendientes === b.pendientes
    );
  }

  private appendBatchToLoadedProducts(batch: PantryItem[]): void {
    if (!batch.length) return;
    this.loadedProducts.update(items => {
      if (!items.length) return [...batch];
      const next = [...items];
      const indexById = new Map<string, number>();
      next.forEach((item, idx) => indexById.set(item._id, idx));
      for (const doc of batch) {
        const existing = indexById.get(doc._id);
        if (existing != null) {
          next[existing] = doc;
        } else {
          indexById.set(doc._id, next.length);
          next.push(doc);
        }
      }
      return next;
    });
  }

  private replaceProductInCache(item: PantryItem): void {
    let added = false;
    this.loadedProducts.update(items => {
      const index = items.findIndex(e => e._id === item._id);
      if (index < 0) { added = true; return [item, ...items]; }
      const next = [...items];
      next[index] = item;
      return next;
    });
    if (added) this.totalCount.update(c => c + 1);
  }

  private removeProductFromCache(id: string): void {
    if (!id) return;
    let removed = false;
    this.loadedProducts.update(items => {
      const next = items.filter(item => item._id !== id);
      removed = next.length !== items.length;
      return next;
    });
    if (removed) this.totalCount.update(c => Math.max(0, c - 1));
  }

  private async loadAllPages(): Promise<void> {
    while (!this.endReached()) await this.loadNextPage();
  }
}
