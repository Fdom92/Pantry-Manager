import { Injectable, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import {
  BatchEntryMeta,
  BatchStatusMeta,
  FastAddEntry,
  FilterChipViewModel,
  ItemBatch,
  PantryFilterState,
  PantryItem,
  PantryItemCardViewModel,
  PantryStatusFilterValue,
  PantrySummaryMeta,
} from '@core/models/pantry';
import { computeSupermarketSuggestions } from '@core/utils/pantry-selectors.util';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryBatchOperationsService } from './pantry-batch-operations.service';
import { PantryBatchesModalStateService } from './modals/pantry-batches-modal-state.service';
import { PantryFastAddModalStateService } from './modals/pantry-fast-add-modal-state.service';
import { PantryListUiStateService } from './pantry-list-ui-state.service';
import { PantryStoreService } from './pantry-store.service';
import { PantryViewModelService } from './pantry-view-model.service';

/**
 * Main orchestrator for pantry page state.
 * Delegates to specialized services for batch operations, UI state, and modals.
 */
@Injectable()
export class PantryStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly viewModel = inject(PantryViewModelService);
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly listUi = inject(PantryListUiStateService);
  private readonly fastAddModal = inject(PantryFastAddModalStateService);
  private readonly batchesModal = inject(PantryBatchesModalStateService);

  // Core state signals
  readonly skeletonPlaceholders = this.listUi.skeletonPlaceholders;
  readonly loading = this.pantryStore.loading;
  readonly searchTerm: Signal<string> = this.pantryStore.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryStore.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryStore.pipelineResetting;
  readonly hasCompletedInitialLoad: WritableSignal<boolean> = signal(false);
  readonly editItemModalRequest: WritableSignal<{ mode: 'create' } | { mode: 'edit'; item: PantryItem } | null> = signal(null);
  readonly addModeSheetOpen: WritableSignal<boolean> = signal(false);
  readonly pantryItemsState: WritableSignal<PantryItem[]> = signal([]);
  readonly summarySnapshot: WritableSignal<PantrySummaryMeta> = signal({
    total: 0,
    visible: 0,
    basicCount: 0,
    statusCounts: { expired: 0, expiring: 0, lowStock: 0, normal: 0 },
  });

  // Delegated signals from specialized services
  readonly collapsedGroups = this.listUi.collapsedGroups;
  readonly deletingItems = this.listUi.deletingItems;
  readonly fastAddModalOpen = this.fastAddModal.fastAddModalOpen;
  readonly isFastAdding = this.fastAddModal.isFastAdding;
  readonly fastAddQuery = this.fastAddModal.fastAddQuery;
  readonly fastAddEntries = this.fastAddModal.fastAddEntries;
  readonly fastAddEntryViewModels = this.fastAddModal.fastAddEntryViewModels;
  readonly hasFastAddEntries = this.fastAddModal.hasFastAddEntries;
  readonly fastAddOptions = this.fastAddModal.fastAddOptions;
  readonly showFastAddEmptyAction = this.fastAddModal.showFastAddEmptyAction;
  readonly fastAddEmptyActionLabel = this.fastAddModal.fastAddEmptyActionLabel;
  readonly showBatchesModal = this.batchesModal.showBatchesModal;
  readonly selectedBatchesItem = this.batchesModal.selectedBatchesItem;

  // Computed signals coordinating across services
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
    // Provide batch summaries to batches modal service
    this.batchesModal.batchSummaries = this.batchSummaries;

    // Keep UI in sync with filtered pipeline, merging optimistic batch edits
    effect(() => {
      const paginatedItems = this.pantryStore.filteredProducts();
      this.pantryItemsState.set(this.batchOps.mergePendingItems(paginatedItems));
    });

    // Update summary when items change
    effect(() => {
      const totalCount = this.pantryStore.totalCount();
      const loadedItems = this.pantryStore.activeProducts();
      const isLoading = this.pantryStore.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        this.summarySnapshot.set(this.viewModel.buildSummary(loadedItems, loadedItems.length));
      }
    });

    // Sync expanded items and collapsed groups with current page
    effect(() => this.listUi.syncExpandedItems(this.pantryItemsState()));
    effect(() => this.listUi.syncCollapsedGroups(this.groups()));
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

  // -------- Modal routing --------
  openAdvancedAddModal(event?: Event): void {
    event?.stopPropagation();
    this.editItemModalRequest.set({ mode: 'create' });
  }

  openAddModeSheet(event?: Event): void {
    event?.stopPropagation();
    this.addModeSheetOpen.set(true);
  }

  closeAddModeSheet(): void {
    if (!this.addModeSheetOpen()) return;
    this.addModeSheetOpen.set(false);
  }

  selectAddModeSimple(): void {
    this.closeAddModeSheet();
    this.fastAddModal.openFastAddModal();
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

  // -------- Fast-add modal (delegates to PantryFastAddModalStateService) --------
  openFastAddModal = () => this.fastAddModal.openFastAddModal();
  closeFastAddModal = () => this.fastAddModal.closeFastAddModal();
  dismissFastAddModal = () => this.fastAddModal.dismissFastAddModal();
  submitFastAdd = () => this.fastAddModal.submitFastAdd();
  onFastAddQueryChange = (value: string) => this.fastAddModal.onFastAddQueryChange(value);
  addFastAddEntry = (option: AutocompleteItem<PantryItem>) => this.fastAddModal.addFastAddEntry(option);
  addFastAddEntryFromQuery = (name?: string) => this.fastAddModal.addFastAddEntryFromQuery(name);
  adjustFastAddEntry = (entry: FastAddEntry, delta: number) => this.fastAddModal.adjustFastAddEntry(entry, delta);
  adjustFastAddEntryById = (entryId: string, delta: number) => this.fastAddModal.adjustFastAddEntryById(entryId, delta);

  // -------- List UI state (delegates to PantryListUiStateService) --------
  trackByItemId = (index: number, item: PantryItem) => this.listUi.trackByItemId(index, item);
  onSummaryKeydown = (item: PantryItem, event: KeyboardEvent) => this.listUi.onSummaryKeydown(item, event);
  isExpanded = (item: PantryItem) => this.listUi.isExpanded(item);
  toggleItemExpansion = (item: PantryItem, event?: Event) => this.listUi.toggleItemExpansion(item, event);
  isGroupCollapsed = (key: string) => this.listUi.isGroupCollapsed(key);
  toggleGroupCollapse = (key: string, event?: Event) => this.listUi.toggleGroupCollapse(key, event);
  onGroupHeaderKeydown = (key: string, event: KeyboardEvent) => this.listUi.onGroupHeaderKeydown(key, event);
  isDeleting = (item: PantryItem) => this.listUi.isDeleting(item);
  deleteItem = (item: PantryItem, event?: Event, skipConfirm = false) =>
    this.listUi.deleteItem(item, event, skipConfirm, itemId => this.batchOps.cancelPendingStockSave(itemId));

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

  // -------- Batch operations (delegates to PantryBatchOperationsService) --------
  getTotalQuantity = (item: PantryItem) => this.batchOps.getTotalQuantity(item);
  hasOpenBatch = (item: PantryItem) => this.batchOps.hasOpenBatch(item);
  getLocationLabel = (locationId: string | undefined) => this.batchOps.getLocationLabel(locationId);
  adjustBatchQuantity = (item: PantryItem, locationId: string, batch: ItemBatch, delta: number, event?: Event) =>
    this.batchOps.adjustBatchQuantity(item, locationId, batch, delta, event, this.pantryItemsState);
  cancelPendingStockSave = (itemId: string) => this.batchOps.cancelPendingStockSave(itemId);

  // -------- Batches modal (delegates to PantryBatchesModalStateService) --------
  openBatchesModal = (item: PantryItem, event?: Event) => this.batchesModal.openBatchesModal(item, event);
  closeBatchesModal = () => this.batchesModal.closeBatchesModal();
  dismissBatchesModal = () => this.batchesModal.dismissBatchesModal();
  getTotalBatchCount = (item: PantryItem) => this.batchesModal.getTotalBatchCount(item);
  getSortedBatches = (item: PantryItem) => this.batchesModal.getSortedBatches(item);
  buildItemCardViewModel = (item: PantryItem) => this.batchesModal.buildItemCardViewModel(item);
  formatBatchDate = (batch: ItemBatch) => this.batchesModal.formatBatchDate(batch);
  formatBatchQuantity = (batch: ItemBatch) => this.batchesModal.formatBatchQuantity(batch);
  getBatchStatus = (batch: ItemBatch) => this.batchesModal.getBatchStatus(batch);

  onDestroy(): void {
    this.batchOps.clearAll();
  }

  // -------- Private helpers --------
  private getStatusFilterValue(filters: PantryFilterState): PantryStatusFilterValue {
    if (filters.expired) return 'expired';
    if (filters.expiring) return 'near-expiry';
    if (filters.lowStock) return 'low-stock';
    if (filters.normalOnly) return 'normal';
    return 'all';
  }
}
