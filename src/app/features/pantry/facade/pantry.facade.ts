import { Injectable, inject } from '@angular/core';
import type { FilterChipViewModel, ItemBatch, ItemLocationStock, PantryItem } from '@core/models/pantry';
import type { BatchEntryMeta } from '@core/models/pantry';
import type { MeasurementUnit } from '@core/models/shared';
import { PantryStateService } from '@core/services/pantry';

@Injectable()
export class PantryFacade {
  private readonly state = inject(PantryStateService);

  // Signals/computed for the view
  readonly loading = this.state.loading;
  readonly hasCompletedInitialLoad = this.state.hasCompletedInitialLoad;
  readonly showFilters = this.state.showFilters;
  readonly skeletonPlaceholders = this.state.skeletonPlaceholders;
  readonly MeasurementUnit = this.state.MeasurementUnit;

  readonly searchTerm = this.state.searchTerm;
  readonly activeFilters = this.state.activeFilters;
  readonly selectedCategory = this.state.selectedCategory;
  readonly selectedLocation = this.state.selectedLocation;
  readonly sortOption = this.state.sortOption;
  readonly statusFilter = this.state.statusFilter;
  readonly basicOnly = this.state.basicOnly;

  readonly pantryItemsState = this.state.pantryItemsState;
  readonly groups = this.state.groups;
  readonly summary = this.state.summary;
  readonly filterChips = this.state.filterChips;
  readonly categoryOptions = this.state.categoryOptions;
  readonly locationOptions = this.state.locationOptions;
  readonly supermarketSuggestions = this.state.supermarketSuggestions;
  readonly presetCategoryOptions = this.state.presetCategoryOptions;
  readonly presetLocationOptions = this.state.presetLocationOptions;
  readonly presetSupermarketOptions = this.state.presetSupermarketOptions;
  readonly batchSummaries = this.state.batchSummaries;

  // Move modal
  readonly showMoveModal = this.state.showMoveModal;
  readonly moveItemTarget = this.state.moveItemTarget;
  readonly moveSubmitting = this.state.moveSubmitting;
  readonly moveError = this.state.moveError;
  readonly moveForm = this.state.moveForm;

  // Batches modal
  readonly showBatchesModal = this.state.showBatchesModal;
  readonly selectedBatchesItem = this.state.selectedBatchesItem;

  // Fast add modal
  readonly fastAddModalOpen = this.state.fastAddModalOpen;
  readonly isFastAdding = this.state.isFastAdding;
  readonly fastAddForm = this.state.fastAddForm;
  readonly hasFastAddEntries = this.state.hasFastAddEntries;

  // List UI state
  readonly collapsedGroups = this.state.collapsedGroups;
  readonly deletingItems = this.state.deletingItems;

  // Lifecycle
  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  onDestroy(): void {
    this.state.onDestroy();
  }

  // Filters
  onSearchTermChange(ev: CustomEvent): void {
    this.state.onSearchTermChange(ev);
  }
  onCategoryChange(ev: CustomEvent): void {
    this.state.onCategoryChange(ev);
  }
  onLocationChange(ev: CustomEvent): void {
    this.state.onLocationChange(ev);
  }
  onSortChange(ev: CustomEvent): void {
    this.state.onSortChange(ev);
  }
  onFilterChipSelected(chip: FilterChipViewModel): void {
    this.state.onFilterChipSelected(chip);
  }
  toggleBasicFilter(): void {
    this.state.toggleBasicFilter();
  }
  openFilters(event?: Event): void {
    this.state.openFilters(event);
  }
  closeFilters(): void {
    this.state.closeFilters();
  }
  clearFilters(): void {
    this.state.clearFilters();
  }

  // Expansion/collapse
  onSummaryKeydown(item: PantryItem, event: KeyboardEvent): void {
    this.state.onSummaryKeydown(item, event);
  }
  isExpanded(item: PantryItem): boolean {
    return this.state.isExpanded(item);
  }
  toggleItemExpansion(item: PantryItem, event?: Event): void {
    this.state.toggleItemExpansion(item, event);
  }
  isGroupCollapsed(key: string): boolean {
    return this.state.isGroupCollapsed(key);
  }
  toggleGroupCollapse(key: string, event?: Event): void {
    this.state.toggleGroupCollapse(key, event);
  }
  onGroupHeaderKeydown(key: string, event: KeyboardEvent): void {
    this.state.onGroupHeaderKeydown(key, event);
  }

  // Item interactions
  trackByItemId(index: number, item: PantryItem): string {
    return this.state.trackByItemId(index, item);
  }
  isDeleting(item: PantryItem): boolean {
    return this.state.isDeleting(item);
  }
  async deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
    await this.state.deleteItem(item, event, skipConfirm);
  }
  async adjustBatchQuantity(
    item: PantryItem,
    location: ItemLocationStock,
    batch: ItemBatch,
    delta: number,
    event?: Event
  ): Promise<void> {
    await this.state.adjustBatchQuantity(item, location, batch, delta, event);
  }

  // View models + modals
  buildItemCardViewModel(item: PantryItem) {
    return this.state.buildItemCardViewModel(item);
  }

  // Stock helpers (used by modals/templates)
  getTotalQuantity(item: PantryItem): number {
    return this.state.getTotalQuantity(item);
  }

  getUnitLabelForItem(item: PantryItem): string {
    return this.state.getUnitLabelForItem(item);
  }

  getTotalBatchCount(item: PantryItem): number {
    return this.state.getTotalBatchCount(item);
  }

  getSortedBatches(item: PantryItem): BatchEntryMeta[] {
    return this.state.getSortedBatches(item);
  }

  formatBatchDate(batch: ItemBatch): string {
    return this.state.formatBatchDate(batch);
  }

  formatBatchQuantity(batch: ItemBatch, locationUnit: string | MeasurementUnit | undefined): string {
    return this.state.formatBatchQuantity(batch, locationUnit);
  }
  openBatchesModal(item: PantryItem, event?: Event): void {
    this.state.openBatchesModal(item, event);
  }
  closeBatchesModal(): void {
    this.state.closeBatchesModal();
  }
  openMoveItemModal(item: PantryItem, event?: Event): void {
    this.state.openMoveItemModal(item, event);
  }
  closeMoveItemModal(): void {
    this.state.closeMoveItemModal();
  }
  onMoveSourceChange(): void {
    this.state.onMoveSourceChange();
  }
  getMoveSourceOptions(item: PantryItem | null) {
    return this.state.getMoveSourceOptions(item);
  }
  getMoveDestinationSuggestions(item: PantryItem | null): string[] {
    return this.state.getMoveDestinationSuggestions(item);
  }
  applyMoveDestination(value: string): void {
    this.state.applyMoveDestination(value);
  }
  getMoveAvailabilityLabel(item: PantryItem | null): string {
    return this.state.getMoveAvailabilityLabel(item);
  }
  async submitMoveItem(): Promise<void> {
    await this.state.submitMoveItem();
  }

  // Edit modal (controlled by state)
  openAdvancedAddModal(event?: Event): void {
    this.state.openAdvancedAddModal(event);
  }
  openEditItemModal(item: PantryItem, event?: Event): void {
    this.state.openEditItemModal(item, event);
  }

  readonly editItemModalRequest = this.state.editItemModalRequest;
  clearEditItemModalRequest(): void {
    this.state.clearEditItemModalRequest();
  }

  cancelPendingStockSave(itemId: string): void {
    this.state.cancelPendingStockSave(itemId);
  }

  // Fast add
  openFastAddModal(): void {
    this.state.openFastAddModal();
  }
  closeFastAddModal(): void {
    this.state.closeFastAddModal();
  }
  async submitFastAdd(): Promise<void> {
    await this.state.submitFastAdd();
  }
}
