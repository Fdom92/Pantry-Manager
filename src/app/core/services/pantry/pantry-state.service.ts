import { Injectable, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import {
  AddEntry,
  FilterChipViewModel,
  ItemBatch,
  PantryFilterState,
  PantryItem,
  PantryStatusFilterValue,
  PantrySummaryMeta,
} from '@core/models/pantry';
import { computeSupermarketSuggestions } from '@core/utils/pantry-selectors.util';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryBatchOperationsService } from './pantry-batch-operations.service';
import { PantryBatchesModalStateService } from './modals/pantry-batches-modal-state.service';
import { PantryAddModalStateService } from './modals/pantry-add-modal-state.service';
import { PantryConsumeModalStateService } from './modals/pantry-consume-modal-state.service';
import { PantryQuantitySheetStateService } from './modals/pantry-quantity-sheet-state.service';
import { PantryListUiStateService } from './pantry-list-ui-state.service';
import { PantryStoreService } from './pantry-store.service';
import { PantryViewModelService } from './pantry-view-model.service';
import { SkeletonLoadingManager } from '@core/utils';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { type FreshState, freshStateToQty } from '@core/domain/pantry';

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
  private readonly addModal = inject(PantryAddModalStateService);
  private readonly consumeModal = inject(PantryConsumeModalStateService);
  private readonly batchesModal = inject(PantryBatchesModalStateService);
  private readonly quantitySheet = inject(PantryQuantitySheetStateService);
  private readonly freshAddModal = inject(PantryFreshAddModalStateService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  // Core state signals
  readonly skeletonPlaceholders = this.listUi.skeletonPlaceholders;
  readonly loading = this.pantryStore.loading;
  readonly searchTerm: Signal<string> = this.pantryStore.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryStore.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryStore.pipelineResetting;
  readonly hasCompletedInitialLoad: WritableSignal<boolean> = signal(false);
  readonly editItemModalRequest: WritableSignal<{ mode: 'edit'; item: PantryItem } | null> = signal(null);
  readonly editFreshItemModalRequest: WritableSignal<{ mode: 'edit'; item: PantryItem } | null> = signal(null);
  readonly pantryItemsState: WritableSignal<PantryItem[]> = signal([]);
  readonly summarySnapshot: WritableSignal<PantrySummaryMeta> = signal({
    total: 0,
    visible: 0,
    statusCounts: { expired: 0, expiring: 0, review: 0, lowStock: 0, normal: 0, pendientes: 0 },
  });

  private readonly skeletonManager = new SkeletonLoadingManager();
  readonly showSkeleton = this.skeletonManager.showSkeleton;

  // Delegated signals from specialized services
  readonly collapsedGroups = this.listUi.collapsedGroups;
  readonly deletingItems = this.listUi.deletingItems;
  readonly addModalOpen = this.addModal.addModalOpen;
  readonly isAdding = this.addModal.isAdding;
  readonly addQuery = this.addModal.addQuery;
  readonly addEntries = this.addModal.addEntries;
  readonly addEntryViewModels = this.addModal.addEntryViewModels;
  readonly hasAddEntries = this.addModal.hasAddEntries;
  readonly addOptions = this.addModal.addOptions;
  readonly showAddEmptyAction = this.addModal.showAddEmptyAction;
  readonly addEmptyActionLabel = this.addModal.addEmptyActionLabel;
  readonly consumeModalOpen = this.consumeModal.consumeModalOpen;
  readonly isConsuming = this.consumeModal.isConsuming;
  readonly consumeQuery = this.consumeModal.consumeQuery;
  readonly consumeEntries = this.consumeModal.consumeEntries;
  readonly consumeEntryViewModels = this.consumeModal.consumeEntryViewModels;
  readonly hasConsumeEntries = this.consumeModal.hasConsumeEntries;
  readonly consumeOptions = this.consumeModal.consumeOptions;
  readonly showBatchesModal = this.batchesModal.showBatchesModal;
  readonly selectedBatchesItem = this.batchesModal.selectedBatchesItem;
  readonly batchesEditMode = this.batchesModal.editMode;
  readonly editedBatches = this.batchesModal.editedBatches;
  readonly batchesIsSaving = this.batchesModal.isSaving;
  readonly showQuantitySheet = this.quantitySheet.showQuantitySheet;
  readonly selectedQuantitySheetItem = this.quantitySheet.selectedItem;
  readonly pendingQuantityChange = this.quantitySheet.pendingQuantityChange;
  readonly pendingQuantitySheetExpiryDate = this.quantitySheet.pendingExpiryDate;
  readonly pendingQuantitySheetNoExpiry = this.quantitySheet.pendingNoExpiry;

  // Computed signals coordinating across services
  readonly freshItems = computed(() =>
    this.pantryItemsState()
      .filter(i => i.productType === 'fresh')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  );

  /** Total de frescos en el dataset crudo, sin filtrar. */
  readonly totalFreshCount = computed(() =>
    this.pantryStore.loadedProducts().filter(i => i.productType === 'fresh').length,
  );

  /** True si hay frescos creados pero los filtros activos los esconden todos. */
  readonly hasFreshButFilteredEmpty = computed(() =>
    this.totalFreshCount() > 0 && this.freshItems().length === 0,
  );

  /** True si no hay ningún fresco en absoluto (empty state de onboarding). */
  readonly hasNoFreshAtAll = computed(() => this.totalFreshCount() === 0);

  readonly showAllFresh = signal(false);
  readonly visibleFreshItems = computed(() => {
    const items = this.freshItems();
    return this.showAllFresh() ? items : items.slice(0, 4);
  });

  readonly despensaItems = computed(() =>
    this.pantryItemsState().filter(i => i.productType !== 'fresh')
  );
  readonly groups = computed(() => this.viewModel.buildGroups(this.despensaItems()));
  readonly groupByCategory = signal(false);
  toggleGroupByCategory(): void { this.groupByCategory.update(v => !v); }
  readonly flatDespensaItems = computed(() =>
    [...this.despensaItems()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  );
  readonly statusFilter = computed(() => this.getStatusFilterValue(this.activeFilters()));
  readonly summary = computed<PantrySummaryMeta>(() => this.summarySnapshot());
  readonly filterChips = computed(() =>
    this.viewModel.buildFilterChips(this.summary(), this.statusFilter())
  );
  readonly supermarketSuggestions = computed(() => computeSupermarketSuggestions(this.pantryItemsState()));
  readonly presetLocationOptions = computed(() =>
    this.viewModel.normalizeLocationOptions(this.appPreferences.preferences().locationOptions)
  );
  readonly batchSummaries = computed(() => this.viewModel.computeBatchSummaries(this.pantryItemsState()));

  // True while any item-editing modal is open. Used to freeze pantryItemsState so
  // items do not vanish from the list mid-edit when they leave the active filter.
  private readonly isAnyEditModalOpen = computed(() =>
    this.batchesModal.showBatchesModal() ||
    this.editItemModalRequest() !== null ||
    this.editFreshItemModalRequest() !== null ||
    this.quantitySheet.showQuantitySheet() ||
    this.consumeModal.consumeModalOpen()
  );

  constructor() {
    // Provide batch summaries to batches modal service
    this.batchesModal.batchSummaries = this.batchSummaries;

    // Provide location options to batches modal service
    this.batchesModal.locationOptions = this.presetLocationOptions;

    // Provide pantry items state to batches modal for optimistic updates
    this.batchesModal.pantryItemsState = this.pantryItemsState;

    // Provide pantry items state to quantity sheet service for optimistic updates
    this.quantitySheet.pantryItemsState = this.pantryItemsState;

    // Provide pantry items state to consume modal for optimistic updates
    this.consumeModal.pantryItemsState = this.pantryItemsState;

    // Keep UI in sync with filtered pipeline, merging optimistic batch edits.
    // Frozen while any edit modal is open so items don't vanish mid-edit when
    // they leave the active filter. List refreshes automatically on modal close.
    effect(() => {
      if (this.isAnyEditModalOpen()) return;
      const paginatedItems = this.pantryStore.filteredProducts();
      this.pantryItemsState.set(this.batchOps.mergePendingItems(paginatedItems));
    }, { allowSignalWrites: true });

    // Update summary when items change
    effect(() => {
      const totalCount = this.pantryStore.totalCount();
      const loadedItems = this.pantryStore.activeProducts();
      const isLoading = this.pantryStore.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        // Include both fresh and pantry items so chip counts reflect both sections.
        this.summarySnapshot.set(this.viewModel.buildSummary(loadedItems, loadedItems.length));
      }
    }, { allowSignalWrites: true });

    // Sync collapsed groups with current page
    effect(() => this.listUi.syncCollapsedGroups(this.groups()));
  }

  /** Lifecycle hook: ensure the store is primed and real-time updates are wired. */
  async ionViewWillEnter(): Promise<void> {
    this.skeletonManager.startLoading();
    this.pantryStore.clearEntryFilters();
    this.pantryStore.applyPendingNavigationPreset();
    await this.loadItems();
    this.pantryStore.watchRealtime();
    this.skeletonManager.stopLoading();
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
    if (chip.value) {
      this.applyStatusFilterPreset(chip.value);
      return;
    }
    this.applyStatusFilterPreset('all');
  }

  // -------- Modal routing --------
  clearEditItemModalRequest(): void {
    this.editItemModalRequest.set(null);
  }

  clearEditFreshItemModalRequest(): void {
    this.editFreshItemModalRequest.set(null);
  }

  // -------- Add modal (delegates to PantryAddModalStateService) --------
  openAddModal = () => this.addModal.openAddModal();
  closeAddModal = () => this.addModal.closeAddModal();
  dismissAddModal = () => this.addModal.dismissAddModal();
  submitAdd = () => this.addModal.submitAdd();
  onAddQueryChange = (value: string) => this.addModal.onAddQueryChange(value);
  addEntry = (option: AutocompleteItem<PantryItem>) => this.addModal.addEntry(option);
  addEntryFromQuery = (name?: string) => this.addModal.addEntryFromQuery(name);
  adjustEntry = (entry: AddEntry, delta: number) => this.addModal.adjustEntry(entry, delta);
  adjustEntryById = (entryId: string, delta: number) => this.addModal.adjustEntryById(entryId, delta);
  setEntryDate = (entryId: string, date: string | undefined) => this.addModal.setEntryDate(entryId, date);

  // -------- Consume modal (delegates to PantryConsumeModalStateService) --------
  openConsumeModal = () => this.consumeModal.openConsumeModal();
  closeConsumeModal = () => this.consumeModal.closeConsumeModal();
  dismissConsumeModal = () => this.consumeModal.dismissConsumeModal();
  submitConsume = () => this.consumeModal.submitConsume();
  onConsumeQueryChange = (value: string) => this.consumeModal.onConsumeQueryChange(value);
  addConsumeEntry = (option: AutocompleteItem<PantryItem>) => this.consumeModal.addConsumeEntry(option);
  adjustConsumeEntryById = (entryId: string, delta: number) => this.consumeModal.adjustConsumeEntryById(entryId, delta);

  // -------- List UI state (delegates to PantryListUiStateService) --------
  trackByItemId = (index: number, item: PantryItem) => this.listUi.trackByItemId(index, item);
  isGroupCollapsed = (key: string) => this.listUi.isGroupCollapsed(key);
  toggleGroupCollapse = (key: string, event?: Event) => this.listUi.toggleGroupCollapse(key, event);
  onGroupHeaderKeydown = (key: string, event: KeyboardEvent) => this.listUi.onGroupHeaderKeydown(key, event);
  isDeleting = (item: PantryItem) => this.listUi.isDeleting(item);

  deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
     this.quantitySheet.dismissQuantitySheet();
     return this.listUi.deleteItem(item, event, skipConfirm, itemId => this.batchOps.cancelPendingStockSave(itemId));
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
          review: false,
          pendientes: false,
        });
        break;
      case 'near-expiry':
        this.pantryStore.setFilters({
          expired: false,
          expiring: true,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
          pendientes: false,
        });
        break;
      case 'low-stock':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: true,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
          pendientes: false,
        });
        break;
      case 'normal':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: true,
          review: false,
          pendientes: false,
        });
        break;
      case 'review':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: true,
          pendientes: false,
        });
        break;
      case 'pendientes':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
          pendientes: true,
        });
        break;
      default:
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
          pendientes: false,
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
  enterBatchesEditMode = () => this.batchesModal.enterEditMode();
  cancelBatchesEditMode = () => this.batchesModal.cancelEditMode();
  addBatchesEntry = () => this.batchesModal.addBatch();
  updateBatchQuantity = (index: number, quantity: number) => this.batchesModal.updateBatchQuantity(index, quantity);
  updateBatchExpirationDate = (index: number, dateString: string) => this.batchesModal.updateBatchExpirationDate(index, dateString);
  updateBatchNoExpiry = (index: number) => this.batchesModal.updateBatchNoExpiry(index);
  updateBatchLocation = (index: number, locationId: string) => this.batchesModal.updateBatchLocation(index, locationId);
  getBatchDateInputValue = (batch: ItemBatch) => this.batchesModal.getBatchDateInputValue(batch);
  saveBatches = async () => await this.batchesModal.saveBatches();
  getLocationAutocompleteOptions = () => this.batchesModal.getLocationAutocompleteOptions();
  getLocationDisplayValue = (batch: ItemBatch) => this.batchesModal.getLocationDisplayValue(batch);
  onLocationAutocompleteSelect = (index: number, option: AutocompleteItem<string>) => this.batchesModal.onLocationAutocompleteSelect(index, option);
  addLocationOptionFromText = (index: number, value: string) => this.batchesModal.addLocationOptionFromText(index, value);
  clearBatchLocation = (index: number) => this.batchesModal.clearBatchLocation(index);

  // -------- Quantity sheet (delegates to PantryQuantitySheetStateService) --------
  openQuantitySheet = (item: PantryItem, event?: Event) => this.quantitySheet.openQuantitySheet(item, event);
  dismissQuantitySheet = () => this.quantitySheet.dismissQuantitySheet();
  incrementQuantity = (item: PantryItem) => this.quantitySheet.incrementQuantity(item);
  decrementQuantity = (item: PantryItem) => this.quantitySheet.decrementQuantity(item);
  getQuantitySheetTotalQuantity = (item: PantryItem) => this.quantitySheet.getTotalQuantity(item);
  setQuantitySheetExpiryDate = (date: string | undefined) => this.quantitySheet.setExpiryDate(date);
  toggleQuantitySheetNoExpiry = () => this.quantitySheet.toggleNoExpiry();

  closeQuantitySheetWithSave(): void {
    this.quantitySheet.closeQuantitySheet();
  }

  async openBatchesModalFromSheet(item: PantryItem): Promise<void> {
    await this.quantitySheet.dismissQuantitySheet();
    const updatedItem = this.pantryItemsState().find(i => i._id === item._id) ?? item;
    this.batchesModal.openBatchesModal(updatedItem);
  }

  async openEditModalFromSheet(item: PantryItem): Promise<void> {
    await this.quantitySheet.dismissQuantitySheet();
    const updatedItem = this.pantryItemsState().find(i => i._id === item._id) ?? item;
    if (updatedItem.productType === 'fresh') {
      this.editFreshItemModalRequest.set({ mode: 'edit', item: updatedItem });
      return;
    }
    this.editItemModalRequest.set({ mode: 'edit', item: updatedItem });
  }

  async setFreshState(item: PantryItem, state: FreshState): Promise<void> {
    const newQty = freshStateToQty(state);
    const currentBatches = item.batches ?? [];
    // Convención: un fresco tiene exactamente 1 lote. Defensivamente, si llegan más,
    // actualizamos el primero y conservamos los demás intactos.
    const updatedBatches = currentBatches.length > 0
      ? [{ ...currentBatches[0], quantity: newQty }, ...currentBatches.slice(1)]
      : [{ batchId: `batch-${Date.now()}`, quantity: newQty }];

    await this.pantryStore.updateItem({ ...item, batches: updatedBatches });

    let msgKey: string;
    let duration = 1500;
    if (state === 'none' && item.isBasic) {
      msgKey = 'pantry.toasts.addedToList';
    } else if (state === 'none') {
      msgKey = 'pantry.fresh.toast.markedOutHint';
      duration = 2500;
    } else if (state === 'low') {
      msgKey = 'pantry.fresh.toast.updatedLow';
    } else {
      msgKey = 'pantry.fresh.toast.updated';
    }
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(msgKey),
      duration,
      position: 'bottom',
    });
    await toast.present();
  }

  async toggleItemBasic(item: PantryItem): Promise<void> {
    const isBasic = !item.isBasic;
    const updated: PantryItem = {
      ...item,
      isBasic,
      updatedAt: new Date().toISOString(),
    };
    if (!isBasic) {
      updated.minThreshold = undefined;
    }
    await this.pantryStore.updateItem(updated);
    const isDepleted = this.batchOps.getTotalQuantity(item) <= 0;
    let msgKey: string;
    if (isBasic) {
      msgKey = isDepleted ? 'pantry.toasts.addedToList' : 'pantry.toasts.isBasicOn';
    } else {
      msgKey = isDepleted ? 'pantry.toasts.isBasicOffDepleted' : 'pantry.toasts.isBasicOff';
    }
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(msgKey),
      duration: 1200,
      position: 'bottom',
    });
    await toast.present();
  }

  openFreshAddModal(): void {
    this.freshAddModal.open();
  }

  toggleShowAllFresh(): void {
    this.showAllFresh.update(v => !v);
  }

  onDestroy(): void {
    this.batchOps.clearAll();
  }

  // -------- Private helpers --------
  private getStatusFilterValue(filters: PantryFilterState): PantryStatusFilterValue {
    if (filters.expired) return 'expired';
    if (filters.review) return 'review';
    if (filters.expiring) return 'near-expiry';
    if (filters.lowStock) return 'low-stock';
    if (filters.normalOnly) return 'normal';
    if (filters.pendientes) return 'pendientes';
    return 'all';
  }
}
