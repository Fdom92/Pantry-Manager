import { Injectable, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { UNASSIGNED_LOCATION_KEY } from '@core/constants';
import {
  buildFastAddItemPayload,
  computeEarliestExpiry,
  normalizeBatches,
  sumQuantities,
  toNumberOrZero,
} from '@core/domain/pantry';
import {
  BatchEntryMeta,
  BatchStatusMeta,
  BatchSummaryMeta,
  FastAddEntry,
  FilterChipViewModel,
  ItemBatch,
  PantryFilterState,
  PantryGroup,
  PantryItem,
  PantryItemCardViewModel,
  PantryStatusFilterValue,
  PantrySummaryMeta,
} from '@core/models/pantry';
import { createDocumentId } from '@core/utils';
import { formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import {
  dedupeByNormalizedKey,
  formatFriendlyName,
  normalizeLocationId,
  normalizeLowercase,
  normalizeTrim,
} from '@core/utils/normalization.util';
import { computeSupermarketSuggestions } from '@core/utils/pantry-selectors.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { ConfirmService, sleep, withSignalFlag } from '../shared';
import { LanguageService } from '../shared/language.service';
import { PantryStoreService } from './pantry-store.service';
import { PantryViewModelService } from './pantry-view-model.service';

@Injectable()
export class PantryStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly confirm = inject(ConfirmService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly viewModel = inject(PantryViewModelService);
  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingEventMeta = new Map<string, {
    batchId?: string;
    adjustmentType?: 'add' | 'consume';
    deltaQuantity?: number;
  }>();
  private readonly stockSaveDelay = 500;
  private readonly expandedItems = new Set<string>();
  private readonly deleteAnimationDuration = 220;
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);
  readonly loading = this.pantryStore.loading;
  readonly searchTerm: Signal<string> = this.pantryStore.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryStore.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryStore.pipelineResetting;
  readonly hasCompletedInitialLoad: WritableSignal<boolean> = signal(false);
  readonly collapsedGroups: WritableSignal<Set<string>> = signal<Set<string>>(new Set());
  readonly deletingItems: WritableSignal<Set<string>> = signal<Set<string>>(new Set());
  readonly editItemModalRequest: WritableSignal<{ mode: 'create' } | { mode: 'edit'; item: PantryItem } | null> = signal< { mode: 'create' } | { mode: 'edit'; item: PantryItem } | null>(null);
  readonly fastAddModalOpen: WritableSignal<boolean> = signal(false);
  readonly isFastAdding: WritableSignal<boolean> = signal(false);
  readonly fastAddQuery: WritableSignal<string> = signal('');
  readonly fastAddEntries: WritableSignal<FastAddEntry[]> = signal<FastAddEntry[]>([]);
  readonly addModeSheetOpen: WritableSignal<boolean> = signal(false);
  readonly showBatchesModal: WritableSignal<boolean> = signal(false);
  readonly selectedBatchesItem: WritableSignal<PantryItem | null> = signal<PantryItem | null>(null);
  readonly pantryItemsState: WritableSignal<PantryItem[]> = signal<PantryItem[]>([]);
  readonly summarySnapshot: WritableSignal<PantrySummaryMeta> = signal<PantrySummaryMeta>({
    total: 0,
    visible: 0,
    basicCount: 0,
    statusCounts: {
      expired: 0,
      expiring: 0,
      lowStock: 0,
      normal: 0,
    },
  });
  readonly fastAddEntryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.fastAddEntries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
    }))
  );
  readonly hasFastAddEntries = computed(() => this.fastAddEntries().length > 0);
  readonly fastAddOptions = computed(() =>
    this.buildFastAddOptions(this.pantryStore.loadedProducts(), this.fastAddEntries())
  );
  readonly showFastAddEmptyAction = computed(() => normalizeTrim(this.fastAddQuery()).length >= 1);
  readonly fastAddEmptyActionLabel = computed(() => {
    const name = normalizeTrim(this.fastAddQuery());
    if (!name) {
      return '';
    }
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });
  readonly groups = computed(() => this.viewModel.buildGroups(this.pantryItemsState()));
  readonly statusFilter = computed(() => this.getStatusFilterValue(this.activeFilters()));
  readonly basicOnly = computed(() => this.activeFilters().basic);
  readonly summary = computed<PantrySummaryMeta>(() => this.summarySnapshot());
  readonly filterChips = computed(() =>
    this.viewModel.buildFilterChips(this.summary(), this.statusFilter(), this.basicOnly())
  );
  readonly supermarketSuggestions = computed(() => computeSupermarketSuggestions(this.pantryItemsState()));
  readonly presetLocationOptions = computed(() =>
    this.viewModel.normalizeLocationOptions(this.appPreferences.preferences().locationOptions)
  );
  readonly batchSummaries = computed(() => this.viewModel.computeBatchSummaries(this.pantryItemsState()));

  constructor() {
    // Keep the UI in sync with the filtered pipeline, merging optimistic edits before rendering the list.
    effect(() => {
      const paginatedItems = this.pantryStore.filteredProducts();
      this.pantryItemsState.set(this.mergePendingItems(paginatedItems));
    });

    effect(() => {
      const totalCount = this.pantryStore.totalCount();
      const loadedItems = this.pantryStore.activeProducts();
      const isLoading = this.pantryStore.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        this.summarySnapshot.set(this.viewModel.buildSummary(loadedItems, loadedItems.length));
      }
    });

    // Expansion/collapse depend on ids that can disappear when new pages arrive.
    effect(() => {
      this.syncExpandedItems(this.pantryItemsState());
    });

    effect(() => {
      this.syncCollapsedGroups(this.groups());
    });
  }

  /** Lifecycle hook: ensure the store is primed and real-time updates are wired. */
  async ionViewWillEnter(): Promise<void> {
    this.pantryStore.clearEntryFilters();
    this.pantryStore.applyPendingNavigationPreset();
    await this.loadItems();
    this.pantryStore.watchRealtime();
  }

  async loadItems(): Promise<void> {
    if (this.pantryStore.loadedProducts().length === 0) {
      await this.pantryStore.ensureFirstPageLoaded();
    }
    if (!this.pantryStore.pipelineResetting()) {
      this.pantryStore.startBackgroundLoad();
    }
    this.hasCompletedInitialLoad.set(true);
  }

  // -------- Filters --------
  onSearchTermChange(ev: CustomEvent): void {
    this.pantryStore.setSearchQuery(ev.detail?.value ?? '');
  }

  onFilterChipSelected(chip: FilterChipViewModel): void {
    if (chip.kind === 'basic') {
      this.toggleBasicFilter();
      return;
    }
    if (chip.value) {
      this.applyStatusFilterPreset(chip.value);
      return;
    }
    this.applyStatusFilterPreset('all');
  }

  toggleBasicFilter(): void {
    const next = !this.basicOnly();
    this.pantryStore.setFilters({
      basic: next,
      expired: false,
      expiring: false,
      lowStock: false,
      recentlyAdded: false,
      normalOnly: false,
    });
  }

  // -------- Edit item modal (request-based) --------
  openAdvancedAddModal(event?: Event): void {
    event?.stopPropagation();
    this.editItemModalRequest.set({ mode: 'create' });
  }

  openAddModeSheet(event?: Event): void {
    event?.stopPropagation();
    this.addModeSheetOpen.set(true);
  }

  closeAddModeSheet(): void {
    if (!this.addModeSheetOpen()) {
      return;
    }
    this.addModeSheetOpen.set(false);
  }

  selectAddModeSimple(): void {
    this.closeAddModeSheet();
    this.openFastAddModal();
  }

  selectAddModeAdvanced(): void {
    this.closeAddModeSheet();
    this.openAdvancedAddModal();
  }

  openEditItemModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.editItemModalRequest.set({ mode: 'edit', item });
  }

  clearEditItemModalRequest(): void {
    this.editItemModalRequest.set(null);
  }

  // -------- Fast add --------
  openFastAddModal(): void {
    this.fastAddEntries.set([]);
    this.fastAddQuery.set('');
    this.fastAddModalOpen.set(true);
    this.isFastAdding.set(false);
  }

  closeFastAddModal(): void {
    if (this.fastAddModalOpen()) {
      return;
    }
    this.fastAddModalOpen.set(false);
    this.isFastAdding.set(false);
    this.fastAddEntries.set([]);
    this.fastAddQuery.set('');
  }

  dismissFastAddModal(): void {
    this.fastAddModalOpen.set(false);
  }

  async submitFastAdd(): Promise<void> {
    if (this.isFastAdding()) {
      return;
    }
    const entries = this.fastAddEntries().filter(entry => entry.quantity > 0);
    if (!entries.length) {
      return;
    }

    await withSignalFlag(this.isFastAdding, async () => {
      for (const entry of entries) {
        const timestamp = new Date().toISOString();
        if (entry.isNew || !entry.item) {
          const item = buildFastAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: entry.quantity,
          });
          await this.pantryStore.addItem(item);
          await this.eventManager.logFastAddNewItem(item, entry.quantity, timestamp);
          continue;
        }

        const updated = await this.pantryStore.addNewLot(entry.item._id, {
          quantity: entry.quantity,
        });
        if (updated) {
          await this.pantryStore.updateItem(updated);
          await this.eventManager.logFastAddExistingItem(entry.item, updated, entry.quantity, timestamp);
        }
      }
      this.dismissFastAddModal();
    }).catch(async err => {
      console.error('[PantryStateService] submitFastAdd error', err);
    });
  }

  onFastAddQueryChange(value: string): void {
    this.fastAddQuery.set(value ?? '');
  }

  addFastAddEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.fastAddEntries.update(current => {
      const existingIndex = current.findIndex(entry => entry.item?._id === item._id);
      if (existingIndex >= 0) {
        const next = [...current];
        const updated = { ...next[existingIndex] };
        updated.quantity = Math.max(0, updated.quantity + 1);
        next[existingIndex] = updated;
        return next;
      }
      return [
        ...current,
        {
          id: `fast-add:${item._id}`,
          name: option.title,
          quantity: 1,
          item,
          isNew: false,
        },
      ];
    });
    this.fastAddQuery.set('');
  }

  addFastAddEntryFromQuery(name?: string): void {
    const nextName = normalizeTrim(name ?? this.fastAddQuery());
    if (!nextName) {
      return;
    }
    const normalized = normalizeLowercase(nextName);
    const matchingItem = this.pantryStore.loadedProducts()
      .find(item => normalizeLowercase(item.name) === normalized);
    if (matchingItem) {
      const option: AutocompleteItem<PantryItem> = {
        id: matchingItem._id,
        title: matchingItem.name,
        raw: matchingItem,
      };
      this.addFastAddEntry(option);
      return;
    }
    const formattedName = formatFriendlyName(nextName, nextName);
    this.fastAddEntries.update(current => {
      const existingIndex = current.findIndex(entry => normalizeLowercase(entry.name) === normalized);
      if (existingIndex >= 0) {
        const next = [...current];
        const updated = { ...next[existingIndex] };
        updated.quantity = Math.max(0, updated.quantity + 1);
        next[existingIndex] = updated;
        return next;
      }
      return [
        ...current,
        {
          id: `fast-add:new:${normalized}`,
          name: formattedName,
          quantity: 1,
          isNew: true,
        },
      ];
    });
    this.fastAddQuery.set('');
  }

  adjustFastAddEntry(entry: FastAddEntry, delta: number): void {
    const nextDelta = Number.isFinite(delta) ? delta : 0;
    if (!nextDelta) {
      return;
    }
    this.fastAddEntries.update(current => {
      const index = current.findIndex(row => row.id === entry.id);
      if (index < 0) {
        return current;
      }
      const next = [...current];
      const updated = { ...next[index] };
      updated.quantity = Math.max(0, updated.quantity + nextDelta);
      if (updated.quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = updated;
      return next;
    });
  }

  adjustFastAddEntryById(entryId: string, delta: number): void {
    const entry = this.fastAddEntries().find(current => current.id === entryId);
    if (!entry) {
      return;
    }
    this.adjustFastAddEntry(entry, delta);
  }

  // -------- Expand/collapse + list UI state --------
  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  onSummaryKeydown(item: PantryItem, event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      this.toggleItemExpansion(item);
    }
  }

  isExpanded(item: PantryItem): boolean {
    return this.expandedItems.has(item._id);
  }

  toggleItemExpansion(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedItems.has(item._id)) {
      this.expandedItems.delete(item._id);
    } else {
      this.expandedItems.add(item._id);
    }
  }

  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }

  toggleGroupCollapse(key: string, event?: Event): void {
    event?.stopPropagation();
    this.collapsedGroups.update(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  onGroupHeaderKeydown(key: string, event: KeyboardEvent): void {
    const keyName = event.key.toLowerCase();
    if (keyName === 'enter' || keyName === ' ') {
      event.preventDefault();
      this.toggleGroupCollapse(key);
    }
  }

  isDeleting(item: PantryItem): boolean {
    return this.deletingItems().has(item._id);
  }

  async deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }

    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';
    if (shouldConfirm) {
      const confirmed = this.confirm.confirm(this.translate.instant('pantry.confirmDelete', { name: item.name ?? '' }));
      if (!confirmed) {
        return;
      }
    }

    this.cancelPendingStockSave(item._id);
    this.markItemDeleting(item._id);
    try {
      await sleep(this.deleteAnimationDuration);
      await this.pantryStore.deleteItem(item._id);
      await this.eventManager.logDeleteFromCard(item);
      this.expandedItems.delete(item._id);
    } catch (err) {
      console.error('[PantryStateService] deleteItem error', err);
    } finally {
      this.unmarkItemDeleting(item._id);
    }
  }

  private applyStatusFilterPreset(preset: PantryStatusFilterValue): void {
    switch (preset) {
      case 'expired':
        this.pantryStore.setFilters({
          expired: true,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'near-expiry':
        this.pantryStore.setFilters({
          expired: false,
          expiring: true,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'low-stock':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: true,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'normal':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: true,
          basic: false,
        });
        break;
      default:
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
    }
  }

  // -------- Stock helpers --------
  getTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  hasOpenBatch(item: PantryItem): boolean {
    return this.pantryStore.hasItemOpenBatch(item);
  }

  getLocationLabel(locationId: string | undefined): string {
    return this.viewModel.getLocationLabel(locationId);
  }

  // -------- Batches modal + view models --------
  openBatchesModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectedBatchesItem.set(item);
    this.showBatchesModal.set(true);
  }

  closeBatchesModal(): void {
    if (this.showBatchesModal()) {
      return;
    }
    this.showBatchesModal.set(false);
    this.selectedBatchesItem.set(null);
  }

  dismissBatchesModal(): void {
    this.showBatchesModal.set(false);
  }

  getTotalBatchCount(item: PantryItem): number {
    return this.getBatchSummary(item).total;
  }

  getSortedBatches(item: PantryItem): BatchEntryMeta[] {
    return this.getBatchSummary(item).sorted;
  }

  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel {
    const totalQuantity = this.getTotalQuantity(item);
    const summary = this.getBatchSummary(item);
    return this.viewModel.buildItemCardViewModel({
      item,
      summary,
      totalQuantity,
      totalBatches: summary.total,
    });
  }

  formatBatchDate(batch: ItemBatch): string {
    return this.viewModel.formatBatchDate(batch);
  }

  formatBatchQuantity(batch: ItemBatch): string {
    return this.viewModel.formatBatchQuantity(batch);
  }

  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    return this.viewModel.getBatchStatus(batch);
  }

  // -------- Stock pending + debounce --------
  async adjustBatchQuantity(
    item: PantryItem,
    locationId: string,
    batch: ItemBatch,
    delta: number,
    event?: Event
  ): Promise<void> {
    event?.stopPropagation();
    if (!item?._id || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    const normalizedLocation = normalizeLocationId(locationId, UNASSIGNED_LOCATION_KEY);
    const originalTotal = this.getLocationTotal(item, normalizedLocation);
    const sanitizedBatches = this.sanitizeBatches(item.batches ?? []).map(entry => ({
      ...entry,
      locationId: normalizeLocationId(entry.locationId, UNASSIGNED_LOCATION_KEY),
    }));
    const batchIndex = sanitizedBatches.findIndex(entry => {
      if (batch.batchId && entry.batchId) {
        return entry.batchId === batch.batchId;
      }
      const entryLocation = normalizeLocationId(entry.locationId, UNASSIGNED_LOCATION_KEY);
      const entryExpiry = entry.expirationDate ?? '';
      const targetExpiry = batch.expirationDate ?? '';
      return entryLocation === normalizedLocation && entryExpiry === targetExpiry;
    });

    if (batchIndex < 0) {
      return;
    }

    const currentBatchQuantity = toNumberOrZero(sanitizedBatches[batchIndex].quantity);
    const nextBatchQuantity = roundQuantity(Math.max(0, currentBatchQuantity + delta));

    if (nextBatchQuantity === currentBatchQuantity) {
      return;
    }

    const targetBatchId = sanitizedBatches[batchIndex]?.batchId;
    if (nextBatchQuantity <= 0) {
      sanitizedBatches.splice(batchIndex, 1);
    } else {
      sanitizedBatches[batchIndex] = {
        ...sanitizedBatches[batchIndex],
        quantity: nextBatchQuantity,
        locationId: normalizedLocation,
      };
    }

    const updatedItem = this.rebuildItemWithBatches(item, sanitizedBatches);
    const nextTotal = this.getLocationTotal(updatedItem, normalizedLocation);
    await this.provideQuantityFeedback(originalTotal, nextTotal);
    this.triggerStockSave(item._id, updatedItem, {
      batchId: targetBatchId,
      adjustmentType: delta > 0 ? 'add' : 'consume',
      deltaQuantity: delta,
    });

  }

  onDestroy(): void {
    this.clearStockSaveTimers();
  }

  cancelPendingStockSave(itemId: string): void {
    this.cancelPendingStockSaveInternal(itemId);
  }

  // -------- Internal impls (ported from component) --------
  private markItemDeleting(id: string): void {
    this.deletingItems.update(current => {
      if (current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  private unmarkItemDeleting(id: string): void {
    this.deletingItems.update(current => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  private syncExpandedItems(source: PantryItem[] = this.pantryItemsState()): void {
    const validIds = new Set(source.map(item => item._id));
    for (const id of Array.from(this.expandedItems)) {
      if (!validIds.has(id)) {
        this.expandedItems.delete(id);
      }
    }
  }

  private syncCollapsedGroups(groups: PantryGroup[]): void {
    const validKeys = new Set(groups.map(group => group.key));
    this.collapsedGroups.update(current => {
      const next = new Set(current);
      for (const key of Array.from(next)) {
        if (!validKeys.has(key)) {
          next.delete(key);
        }
      }
      return next;
    });
  }

  private mergePendingItems(source: PantryItem[]): PantryItem[] {
    if (!this.pendingItems.size) {
      return source;
    }

    return source.map(item => {
      const pending = this.pendingItems.get(item._id);
      if (!pending) {
        return item;
      }

      return {
        ...item,
        batches: pending.batches,
        expirationDate: pending.expirationDate ?? item.expirationDate,
        updatedAt: pending.updatedAt ?? item.updatedAt,
      };
    });
  }

  private sanitizeBatches(batches: ItemBatch[] | undefined): ItemBatch[] {
    const generateBatchId = () => `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return normalizeBatches(batches, {
      generateBatchId,
    });
  }

  private rebuildItemWithBatches(item: PantryItem, batches: ItemBatch[]): PantryItem {
    const normalized = this.sanitizeBatches(batches).map(batch => ({
      ...batch,
      locationId: normalizeLocationId(batch.locationId, UNASSIGNED_LOCATION_KEY),
    }));

    const rebuilt = {
      ...item,
      batches: normalized,
      expirationDate: computeEarliestExpiry(normalized),
      updatedAt: new Date().toISOString(),
    };
    this.pantryItemsState.update(items =>
      items.map(existing => (existing._id === rebuilt._id ? rebuilt : existing))
    );
    return rebuilt;
  }

  private triggerStockSave(
    itemId: string,
    updated: PantryItem,
    meta?: {
      batchId?: string;
      adjustmentType?: 'add' | 'consume';
      deltaQuantity?: number;
    }
  ): void {
    this.pendingItems.set(itemId, updated);
    if (meta) {
      const existing = this.pendingEventMeta.get(itemId);
      if (!existing) {
        this.pendingEventMeta.set(itemId, meta);
      } else {
        const nextDelta = (existing.deltaQuantity ?? 0) + (meta.deltaQuantity ?? 0);
        const nextType = this.resolveAdjustmentType(existing.adjustmentType, meta.adjustmentType, nextDelta);
        this.pendingEventMeta.set(itemId, {
          batchId: meta.batchId ?? existing.batchId,
          adjustmentType: nextType,
          deltaQuantity: Number.isFinite(nextDelta) ? nextDelta : undefined,
        });
      }
    }
    const existingTimer = this.stockSaveTimers.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      const pending = this.pendingItems.get(itemId);
      if (pending) {
        try {
          const latest = this.pantryStore.items().find(item => item._id === itemId);
          const nextPayload = latest
            ? {
                ...latest,
                batches: pending.batches,
                expirationDate: pending.expirationDate ?? latest.expirationDate,
                updatedAt: pending.updatedAt ?? new Date().toISOString(),
              }
            : pending;

          await this.pantryStore.updateItem(nextPayload);
          const eventMeta = this.pendingEventMeta.get(itemId);
          const deltaQuantity = eventMeta?.deltaQuantity;
          if (eventMeta?.adjustmentType === 'add') {
            await this.eventManager.logStockAdjust(latest, nextPayload, deltaQuantity ?? 0, eventMeta?.batchId);
          } else if (eventMeta?.adjustmentType === 'consume') {
            await this.eventManager.logStockAdjust(latest, nextPayload, deltaQuantity ?? 0, eventMeta?.batchId);
          }
        } catch (err) {
          console.error('[PantryListStateService] updateItem error', err);
        } finally {
          this.pendingItems.delete(itemId);
          this.pendingEventMeta.delete(itemId);
        }
      }
      this.stockSaveTimers.delete(itemId);
    }, this.stockSaveDelay);

    this.stockSaveTimers.set(itemId, timer);
  }

  private resolveAdjustmentType(
    current: 'add' | 'consume' | undefined,
    next: 'add' | 'consume' | undefined,
    delta: number
  ): 'add' | 'consume' {
    if (Number.isFinite(delta) && delta !== 0) {
      return delta > 0 ? 'add' : 'consume';
    }
    return next ?? current ?? 'add';
  }


  private cancelPendingStockSaveInternal(itemId: string): void {
    const existingTimer = this.stockSaveTimers.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.stockSaveTimers.delete(itemId);
    }
    this.pendingItems.delete(itemId);
    this.pendingEventMeta.delete(itemId);
  }

  private clearStockSaveTimers(): void {
    for (const timer of this.stockSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.stockSaveTimers.clear();
    this.pendingItems.clear();
    this.pendingEventMeta.clear();
  }

  private async provideQuantityFeedback(prev: number, next: number): Promise<void> {
    const style = next > prev ? ImpactStyle.Light : ImpactStyle.Medium;
    await this.hapticImpact(style);
  }

  private async hapticImpact(style: ImpactStyle): Promise<void> {
    try {
      await Haptics.impact({ style });
    } catch {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
    }
  }

  private getLocationTotal(item: PantryItem, locationId: string): number {
    const normalized = normalizeLowercase(locationId);
    const batches = (item.batches ?? []).filter(
      batch => normalizeLowercase(batch.locationId ?? UNASSIGNED_LOCATION_KEY) === normalized
    );
    return sumQuantities(batches, { round: roundQuantity });
  }

  private getStatusFilterValue(filters: PantryFilterState): PantryStatusFilterValue {
    if (filters.expired) {
      return 'expired';
    }
    if (filters.expiring) {
      return 'near-expiry';
    }
    if (filters.lowStock) {
      return 'low-stock';
    }
    if (filters.normalOnly) {
      return 'normal';
    }
    return 'all';
  }

  private buildFastAddOptions(items: PantryItem[], entries: FastAddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
    return (items ?? [])
      .filter(item => !excluded.has(item._id))
      .map(item => {
        const total = this.pantryStore.getItemTotalQuantity(item);
        const formattedQty = formatQuantity(total, locale);
        return {
          id: item._id,
          title: item.name,
          subtitle: formattedQty,
          raw: item,
        };
      });
  }

  // -------- Batch summaries internal --------
  private getBatchSummary(item: PantryItem): BatchSummaryMeta {
    return this.batchSummaries().get(item._id) ?? { total: 0, sorted: [] };
  }
}
