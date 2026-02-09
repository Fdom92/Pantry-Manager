import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NEAR_EXPIRY_WINDOW_DAYS, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import {
  buildFastAddItemPayload,
  classifyExpiry,
  computeEarliestExpiry,
  computeSupermarketSuggestions,
  formatCategoryName as formatCategoryNameCatalog,
  getItemStatusState,
  getPresetLocationOptions,
  normalizeBatches,
  sumQuantities,
  toNumberOrZero,
} from '@core/domain/pantry';
import {
  BatchCountsMeta,
  BatchEntryMeta,
  BatchStatusMeta,
  BatchSummaryMeta,
  FilterChipViewModel,
  ItemBatch,
  PantryFilterState,
  PantryGroup,
  PantryItem,
  FastAddEntry,
  PantryItemBatchViewModel,
  PantryItemCardViewModel,
  PantryItemGlobalStatus,
  PantryStatusFilterValue,
  PantrySummaryMeta,
  ProductStatusState,
} from '@core/models/pantry';
import { ES_DATE_FORMAT_OPTIONS, MeasurementUnit } from '@core/models/shared';
import { AppPreferencesService } from '../settings/app-preferences.service';
import { LanguageService } from '../shared/language.service';
import { PantryService } from './pantry.service';
import { PantryStoreService } from './pantry-store.service';
import { createDocumentId } from '@core/utils';
import { formatDateValue, formatQuantity, formatShortDate, roundQuantity } from '@core/utils/formatting.util';
import {
  normalizeCategoryId,
  normalizeKey,
  normalizeLocationId,
  normalizeUnitValue,
} from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService, withSignalFlag } from '../shared';
import { EventManagerService } from '../events';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { dedupeByNormalizedKey, normalizeEntityName } from '@core/utils/normalization.util';
import { findEntryByKey, toEntitySelectorEntries } from '@core/utils/entity-selector.util';

@Injectable()
export class PantryStateService {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly confirm = inject(ConfirmService);
  private readonly eventManager = inject(EventManagerService);

  // DATA
  readonly MeasurementUnit = MeasurementUnit;
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);
  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingEventMeta = new Map<string, {
    batchId?: string;
    adjustmentType?: 'add' | 'consume';
    deltaQuantity?: number;
  }>();
  private readonly stockSaveDelay = 500;
  private readonly expandedItems = new Set<string>();
  private realtimeSubscribed = false;
  private readonly deleteAnimationDuration = 220;

  // SIGNALS / view state
  readonly loading = this.pantryService.loading;
  readonly hasCompletedInitialLoad = signal(false);
  readonly collapsedGroups = signal<Set<string>>(new Set());
  readonly deletingItems = signal<Set<string>>(new Set());

  // Edit modal requests (handled by the modal component)
  readonly editItemModalRequest = signal<
    | { mode: 'create' }
    | { mode: 'edit'; item: PantryItem }
    | null
  >(null);

  // Fast add modal
  readonly fastAddModalOpen = signal(false);
  readonly isFastAdding = signal(false);
  readonly fastAddQuery = signal('');
  readonly fastAddEntries = signal<FastAddEntry[]>([]);
  readonly fastAddEntryViewModels = computed<EntitySelectorEntry[]>(() =>
    toEntitySelectorEntries(this.fastAddEntries(), entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      unitLabel: entry.unitLabel,
    }))
  );
  readonly hasFastAddEntries = computed(() => this.fastAddEntries().length > 0);
  readonly fastAddOptions = computed(() =>
    this.buildFastAddOptions(this.pantryService.loadedProducts(), this.fastAddEntries())
  );
  readonly showFastAddEmptyAction = computed(() => this.fastAddQuery().trim().length >= 1);
  readonly fastAddEmptyActionLabel = computed(() => this.buildFastAddEmptyActionLabel());
  readonly addModeSheetOpen = signal(false);

  // Batches modal
  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);

  // Pantry list data
  readonly pantryItemsState = signal<PantryItem[]>([]);
  readonly groups = computed(() => this.buildGroups(this.pantryItemsState()));

  // Filters state (mirrors PantryService)
  readonly searchTerm: Signal<string> = this.pantryService.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryService.activeFilters;
  readonly pipelineResetting: Signal<boolean> = this.pantryService.pipelineResetting;
  readonly statusFilter = computed(() => this.getStatusFilterValue(this.activeFilters()));
  readonly basicOnly = computed(() => this.activeFilters().basic);

  // Summary + chips
  readonly summarySnapshot = signal<PantrySummaryMeta>(this.createEmptySummary());
  readonly summary = computed<PantrySummaryMeta>(() => this.summarySnapshot());
  readonly filterChips = computed(() => this.buildFilterChips(this.summary(), this.statusFilter(), this.basicOnly()));

  // Options
  readonly supermarketSuggestions = computed(() => this.computeSupermarketOptions(this.pantryItemsState()));
  readonly presetLocationOptions = computed(() => this.computePresetLocationOptions());

  // Batches
  readonly batchSummaries = computed(() => this.computeBatchSummaries(this.pantryItemsState()));

  constructor() {
    // Keep the UI in sync with the filtered pipeline, merging optimistic edits before rendering the list.
    effect(() => {
      const paginatedItems = this.pantryService.filteredProducts();
      this.pantryItemsState.set(this.mergePendingItems(paginatedItems));
    });

    effect(() => {
      const totalCount = this.pantryService.totalCount();
      const loadedItems = this.pantryService.activeProducts();
      const isLoading = this.pantryService.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        this.summarySnapshot.set(this.buildSummary(loadedItems, loadedItems.length));
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
    this.pantryService.clearEntryFilters();
    this.pantryService.applyPendingNavigationPreset();
    await this.loadItems();
    this.pantryStore.watchRealtime();
  }

  async loadItems(): Promise<void> {
    if (this.pantryService.loadedProducts().length === 0) {
      await this.pantryService.ensureFirstPageLoaded();
    }
    if (!this.pantryService.pipelineResetting()) {
      this.pantryService.startBackgroundLoad();
    }
    this.hasCompletedInitialLoad.set(true);
  }

  // -------- Filters --------
  onSearchTermChange(ev: CustomEvent): void {
    this.pantryService.setSearchQuery(ev.detail?.value ?? '');
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
    this.pantryService.setFilters({
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
      const defaultLocationId = this.getDefaultLocationId();
      for (const entry of entries) {
        const timestamp = new Date().toISOString();
        if (entry.isNew || !entry.item) {
          const item = buildFastAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: entry.quantity,
            defaultLocationId,
          });
          await this.pantryStore.addItem(item);
          await this.eventManager.logFastAddNewItem(item, entry.quantity, timestamp);
          continue;
        }

        const updated = await this.pantryService.addNewLot(entry.item._id, {
          quantity: entry.quantity,
          location: defaultLocationId,
          unit: this.pantryStore.getItemPrimaryUnit(entry.item),
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
    const unitLabel = this.pantryStore.getUnitLabel(this.pantryStore.getItemPrimaryUnit(item));
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
          unitLabel,
          item,
          isNew: false,
        },
      ];
    });
    this.fastAddQuery.set('');
  }

  addFastAddEntryFromQuery(name?: string): void {
    const nextName = (name ?? this.fastAddQuery()).trim();
    if (!nextName) {
      return;
    }
    const normalized = normalizeKey(nextName);
    const matchingItem = this.pantryService.loadedProducts()
      .find(item => normalizeKey(item.name) === normalized);
    if (matchingItem) {
      const option: AutocompleteItem<PantryItem> = {
        id: matchingItem._id,
        title: matchingItem.name,
        raw: matchingItem,
      };
      this.addFastAddEntry(option);
      return;
    }
    const formattedName = normalizeEntityName(nextName, nextName);
    const unitLabel = this.pantryStore.getUnitLabel(MeasurementUnit.UNIT);
    this.fastAddEntries.update(current => {
      const existingIndex = current.findIndex(entry => normalizeKey(entry.name) === normalized);
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
          unitLabel,
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
    const entry = findEntryByKey(this.fastAddEntries(), entryId, current => current.id);
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
      await this.delay(this.deleteAnimationDuration);
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
        this.pantryService.setFilters({
          expired: true,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'near-expiry':
        this.pantryService.setFilters({
          expired: false,
          expiring: true,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'low-stock':
        this.pantryService.setFilters({
          expired: false,
          expiring: false,
          lowStock: true,
          recentlyAdded: false,
          normalOnly: false,
          basic: false,
        });
        break;
      case 'normal':
        this.pantryService.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: true,
          basic: false,
        });
        break;
      default:
        this.pantryService.setFilters({
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

  getPrimaryUnit(item: PantryItem): string {
    return normalizeUnitValue(this.pantryStore.getItemPrimaryUnit(item));
  }

  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getUnitLabelForItem(item: PantryItem): string {
    return this.pantryStore.getUnitLabel(this.getPrimaryUnit(item));
  }

  hasOpenBatch(item: PantryItem): boolean {
    return this.pantryStore.hasItemOpenBatch(item);
  }

  getLocationLabel(locationId: string | undefined): string {
    return normalizeLocationId(locationId, this.translate.instant('common.locations.none'));
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
    const unitLabel = this.getUnitLabelForItem(item);
    const totalBatches = this.getTotalBatchCount(item);
    const locale = this.languageService.getCurrentLocale();
    const formattedQuantityValue = formatQuantity(totalQuantity, locale, {
      maximumFractionDigits: 2,
    });
    const baseQuantityLabel = unitLabel ? `${formattedQuantityValue} ${unitLabel}` : formattedQuantityValue;
    const totalQuantityLabel = this.translate.instant('pantry.detail.totalQuantity', {
      value: baseQuantityLabel,
    });
    const totalBatchesLabel = this.translate.instant(
      totalBatches === 1 ? 'pantry.detail.batches.single' : 'pantry.detail.batches.plural',
      { count: totalBatches }
    );

    const summary = this.getBatchSummary(item);
    const batches = summary.sorted.map(entry => ({
      batch: entry.batch,
      locationId: entry.locationId,
      locationLabel: entry.locationLabel,
      hasLocation: normalizeKey(entry.locationId) !== normalizeKey(UNASSIGNED_LOCATION_KEY),
      status: entry.status,
      formattedDate: this.formatBatchDate(entry.batch),
      quantityLabel: this.formatBatchQuantity(entry.batch, entry.locationUnit),
      quantityValue: toNumberOrZero(entry.batch.quantity),
      unitLabel: this.getUnitLabel(normalizeUnitValue(entry.locationUnit)),
      opened: Boolean(entry.batch.opened),
    }));

    const lowStock = getItemStatusState(item, new Date(), NEAR_EXPIRY_WINDOW_DAYS) === 'low-stock';
    const aggregates = this.computeProductAggregates(batches, lowStock);
    const colorClass = this.getColorClass(aggregates.status.state);
    const fallbackLabel = this.translate.instant('common.dates.none');
    const formattedEarliestExpirationShort = aggregates.earliestDate
      ? formatShortDate(aggregates.earliestDate, locale, { fallback: aggregates.earliestDate })
      : fallbackLabel;
    const formattedEarliestExpirationLong = aggregates.earliestDate
      ? formatDateValue(aggregates.earliestDate, locale, ES_DATE_FORMAT_OPTIONS.numeric, {
          fallback: aggregates.earliestDate,
        })
      : fallbackLabel;

    return {
      item,
      totalQuantity,
      totalQuantityLabel,
      unitLabel,
      totalBatches,
      totalBatchesLabel,
      globalStatus: aggregates.status,
      colorClass,
      earliestExpirationDate: aggregates.earliestDate,
      formattedEarliestExpirationShort,
      formattedEarliestExpirationLong,
      batchCountsLabel: aggregates.batchSummaryLabel,
      batchCounts: aggregates.counts,
      batches,
    };
  }

  formatBatchDate(batch: ItemBatch): string {
    const value = batch.expirationDate;
    if (!value) {
      return this.translate.instant('common.dates.none');
    }
    return formatDateValue(value, this.languageService.getCurrentLocale(), ES_DATE_FORMAT_OPTIONS.numeric, {
      fallback: value,
    });
  }

  formatBatchQuantity(batch: ItemBatch, locationUnit: string | MeasurementUnit | undefined): string {
    const formatted = formatQuantity(toNumberOrZero(batch.quantity), this.languageService.getCurrentLocale(), {
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(normalizeUnitValue(locationUnit));
    return `${formatted} ${unitLabel}`;
  }

  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    const state = classifyExpiry(batch.expirationDate, new Date(), NEAR_EXPIRY_WINDOW_DAYS);
    switch (state) {
      case 'expired':
        return {
          label: this.translate.instant('dashboard.expired.badge'),
          icon: 'alert-circle-outline',
          state: 'expired',
          color: 'danger',
        };
      case 'near-expiry':
        return {
          label: this.translate.instant('dashboard.summary.stats.nearExpiry'),
          icon: 'hourglass-outline',
          state: 'near-expiry',
          color: 'warning',
        };
      case 'normal':
        return {
          label: this.translate.instant('pantry.filters.status.normal'),
          icon: 'checkmark-circle-outline',
          state: 'normal',
          color: 'success',
        };
      default:
        return {
          label: this.translate.instant('common.dates.none'),
          icon: 'remove-circle-outline',
          state: 'unknown',
          color: 'medium',
        };
    }
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
    const unit = normalizeUnitValue(batch.unit ?? this.pantryStore.getItemPrimaryUnit(item));
    const originalTotal = this.getAvailableQuantityFor(item, normalizedLocation);
    const sanitizedBatches = this.sanitizeBatches(item.batches ?? [], unit).map(entry => ({
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
    const nextTotal = this.getAvailableQuantityFor(updatedItem, normalizedLocation);
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  private sanitizeBatches(batches: ItemBatch[] | undefined, unit: MeasurementUnit | string): ItemBatch[] {
    return normalizeBatches(batches, unit, {
      generateBatchId: this.createTempBatchId.bind(this),
    });
  }

  private sumBatchQuantities(batches: ItemBatch[] | undefined): number {
    return sumQuantities(batches, { round: roundQuantity });
  }

  private createTempBatchId(): string {
    return `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private rebuildItemWithBatches(item: PantryItem, batches: ItemBatch[]): PantryItem {
    const fallbackUnit = this.getPrimaryUnit(item);
    const normalized = this.sanitizeBatches(batches, fallbackUnit).map(batch => ({
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
    const normalized = normalizeKey(locationId);
    const batches = (item.batches ?? []).filter(
      batch => normalizeKey(batch.locationId ?? UNASSIGNED_LOCATION_KEY) === normalized
    );
    return this.sumBatchQuantities(batches);
  }

  private getAvailableQuantityFor(item: PantryItem, locationId: string): number {
    return this.getLocationTotal(item, locationId);
  }

  // -------- Summary / grouping / options --------
  private buildSummary(items: PantryItem[], totalCount: number): PantrySummaryMeta {
    const now = new Date();
    const statusCounts = {
      expired: 0,
      expiring: 0,
      lowStock: 0,
      normal: 0,
    };
    let basicCount = 0;

    for (const item of items) {
      if (item.isBasic) {
        basicCount += 1;
      }
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      switch (state) {
        case 'expired':
          statusCounts.expired += 1;
          break;
        case 'near-expiry':
          statusCounts.expiring += 1;
          break;
        case 'low-stock':
          statusCounts.lowStock += 1;
          break;
        default:
          statusCounts.normal += 1;
          break;
      }
    }

    return {
      total: totalCount,
      visible: items.length,
      basicCount,
      statusCounts,
    };
  }

  private createEmptySummary(): PantrySummaryMeta {
    return {
      total: 0,
      visible: 0,
      basicCount: 0,
      statusCounts: {
        expired: 0,
        expiring: 0,
        lowStock: 0,
        normal: 0,
      },
    };
  }

  private buildFilterChips(
    summary: PantrySummaryMeta,
    activeStatus: PantryStatusFilterValue,
    basicActive: boolean,
  ): FilterChipViewModel[] {
    const statusChips = this.buildStatusChips(summary, activeStatus);
    const basicChip = this.buildBasicChip(summary, basicActive);
    return [...statusChips, basicChip];
  }

  private buildStatusChips(
    summary: PantrySummaryMeta,
    activeStatus: PantryStatusFilterValue,
  ): FilterChipViewModel[] {
    const counts = summary.statusCounts;
    return [
      {
        key: 'status-all',
        kind: 'status',
        value: 'all',
        label: 'pantry.filters.all',
        count: summary.total,
        icon: 'layers-outline',
        description: 'pantry.filters.desc.all',
        colorClass: 'chip--all',
        active: activeStatus === 'all',
      },
      {
        key: 'status-normal',
        kind: 'status',
        value: 'normal',
        label: 'pantry.filters.status.normal',
        count: counts.normal,
        icon: 'checkmark-circle-outline',
        description: 'pantry.filters.desc.normal',
        colorClass: 'chip--normal',
        active: activeStatus === 'normal',
      },
      {
        key: 'status-low',
        kind: 'status',
        value: 'low-stock',
        label: 'pantry.filters.status.low',
        count: counts.lowStock,
        icon: 'alert-circle-outline',
        description: 'pantry.filters.desc.low',
        colorClass: 'chip--low',
        active: activeStatus === 'low-stock',
      },
      {
        key: 'status-expiring',
        kind: 'status',
        value: 'near-expiry',
        label: 'pantry.filters.status.expiring',
        count: counts.expiring,
        icon: 'hourglass-outline',
        description: 'pantry.filters.desc.expiring',
        colorClass: 'chip--expiring',
        active: activeStatus === 'near-expiry',
      },
      {
        key: 'status-expired',
        kind: 'status',
        value: 'expired',
        label: 'pantry.filters.status.expired',
        count: counts.expired,
        icon: 'time-outline',
        description: 'pantry.filters.desc.expired',
        colorClass: 'chip--expired',
        active: activeStatus === 'expired',
      },
    ];
  }

  private buildBasicChip(summary: PantrySummaryMeta, isActive: boolean): FilterChipViewModel {
    return {
      key: 'basic',
      kind: 'basic',
      label: 'pantry.filters.basic',
      description: 'pantry.filters.desc.basic',
      count: summary.basicCount,
      icon: 'star-outline',
      colorClass: 'chip--basic',
      active: isActive,
    };
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

  private computeSupermarketOptions(items: PantryItem[]): string[] {
    return computeSupermarketSuggestions(items);
  }

  private computePresetLocationOptions(): string[] {
    return getPresetLocationOptions(this.appPreferences.preferences());
  }

  private buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();
    const now = new Date();

    for (const item of items) {
      const key = normalizeCategoryId(item.categoryId);
      const name = this.formatCategoryName(key);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          items: [],
          lowStockCount: 0,
          expiringCount: 0,
          expiredCount: 0,
        };
        map.set(key, group);
      }

      group.items.push(item);
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      if (state === 'low-stock') {
        group.lowStockCount += 1;
      } else if (state === 'expired') {
        group.expiredCount += 1;
      } else if (state === 'near-expiry') {
        group.expiringCount += 1;
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const group of groups) {
      group.items = group.items.sort((a, b) => this.compareItems(a, b));
    }
    return groups;
  }

  private compareItems(a: PantryItem, b: PantryItem): number {
    const expirationWeightDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationWeightDiff !== 0) {
      return expirationWeightDiff;
    }

    return (a.name ?? '').localeCompare(b.name ?? '');
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

  private formatCategoryName(key: string): string {
    return formatCategoryNameCatalog(key, this.translate.instant('pantry.form.uncategorized'));
  }

  private buildFastAddOptions(items: PantryItem[], entries: FastAddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
    return (items ?? [])
      .filter(item => !excluded.has(item._id))
      .map(item => {
        const total = this.pantryStore.getItemTotalQuantity(item);
        const unit = this.pantryStore.getUnitLabel(this.pantryStore.getItemPrimaryUnit(item));
        const formattedQty = formatQuantity(total, locale, { maximumFractionDigits: 1 });
        return {
          id: item._id,
          title: item.name,
          subtitle: `${formattedQty} ${unit}`.trim(),
          raw: item,
        };
      });
  }

  private buildFastAddEmptyActionLabel(): string {
    const name = this.fastAddQuery().trim();
    if (!name) {
      return '';
    }
    const formatted = normalizeEntityName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  }

  private getDefaultLocationId(): string {
    const presets = this.presetLocationOptions();
    const first = presets[0]?.trim();
    if (first) {
      return first;
    }
    return '';
  }

  // -------- Batch summaries internal --------
  private getBatchSummary(item: PantryItem): BatchSummaryMeta {
    return this.batchSummaries().get(item._id) ?? { total: 0, sorted: [] };
  }

  private collectBatches(item: PantryItem): BatchEntryMeta[] {
    const batches: BatchEntryMeta[] = [];
    const fallbackUnit = this.getPrimaryUnit(item);
    for (const batch of this.sanitizeBatches(item.batches ?? [], fallbackUnit)) {
      const locationId = normalizeLocationId(batch.locationId, UNASSIGNED_LOCATION_KEY);
      const locationLabel = this.getLocationLabel(locationId);
      const locationUnit = normalizeUnitValue(batch.unit ?? fallbackUnit);
      batches.push({
        batch: { ...batch, locationId },
        locationId,
        locationLabel,
        locationUnit,
        status: this.getBatchStatus(batch),
      });
    }
    return batches;
  }

  private computeBatchSummaries(items: PantryItem[]): Map<string, BatchSummaryMeta> {
    const summaries = new Map<string, BatchSummaryMeta>();
    for (const item of items) {
      const collected = this.collectBatches(item);
      if (!collected.length) {
        summaries.set(item._id, { total: 0, sorted: [] });
        continue;
      }
      const sorted = collected
        .sort((a, b) => {
          const aTime = this.getBatchTime(a.batch);
          const bTime = this.getBatchTime(b.batch);
          if (aTime === bTime) {
            return 0;
          }
          if (aTime === null) {
            return 1;
          }
          if (bTime === null) {
            return -1;
          }
          return aTime - bTime;
        })
        .map(entry => ({
          batch: entry.batch,
          locationId: entry.locationId,
          locationLabel: entry.locationLabel,
          locationUnit: entry.locationUnit,
          status: entry.status,
        }));

      summaries.set(item._id, {
        total: collected.length,
        sorted,
      });
    }
    return summaries;
  }

  private getBatchTime(batch: ItemBatch): number | null {
    if (!batch.expirationDate) {
      return null;
    }
    const time = new Date(batch.expirationDate).getTime();
    return Number.isFinite(time) ? time : null;
  }

  private computeProductAggregates(
    batches: PantryItemBatchViewModel[],
    isLowStock: boolean
  ): {
    status: PantryItemGlobalStatus;
    earliestDate: string | null;
    counts: BatchCountsMeta;
    batchSummaryLabel: string;
  } {
    const counts: BatchCountsMeta = {
      total: batches.length,
      expired: 0,
      nearExpiry: 0,
      normal: 0,
      unknown: 0,
    };

    let earliestDate: string | null = null;
    let earliestTime: number | null = null;
    let earliestStatus: ProductStatusState | null = null;

    for (const entry of batches) {
      switch (entry.status.state) {
        case 'expired':
          counts.expired += 1;
          break;
        case 'near-expiry':
          counts.nearExpiry += 1;
          break;
        case 'normal':
          counts.normal += 1;
          break;
        default:
          counts.unknown += 1;
          break;
      }

      if (entry.batch.expirationDate) {
        const time = this.getBatchTime(entry.batch);
        if (time !== null && (earliestTime === null || time < earliestTime)) {
          earliestTime = time;
          earliestDate = entry.batch.expirationDate;
          earliestStatus =
            entry.status.state === 'normal' || entry.status.state === 'unknown'
              ? 'normal'
              : (entry.status.state as Extract<ProductStatusState, 'expired' | 'near-expiry'>);
        }
      }
    }

    let statusState: ProductStatusState;
    if (earliestStatus === 'expired') {
      statusState = 'expired';
    } else if (earliestStatus === 'near-expiry') {
      statusState = 'near-expiry';
    } else if (isLowStock) {
      statusState = 'low-stock';
    } else {
      statusState = 'normal';
    }

    const status = this.getProductStatusMeta(statusState);
    const batchSummaryLabel = this.buildBatchSummaryLabel(counts);

    return {
      status,
      earliestDate,
      counts,
      batchSummaryLabel,
    };
  }

  private getColorClass(state: ProductStatusState): string {
    switch (state) {
      case 'expired':
        return 'state-expired';
      case 'near-expiry':
        return 'state-expiring';
      case 'low-stock':
        return 'state-low-stock';
      default:
        return 'state-ok';
    }
  }

  private getProductStatusMeta(state: ProductStatusState): PantryItemGlobalStatus {
    switch (state) {
      case 'expired':
        return {
          state,
          label: 'Caducado',
          accentColor: 'var(--ion-color-danger)',
          chipColor: 'var(--ion-color-danger)',
          chipTextColor: 'var(--ion-color-dark-contrast)',
        };
      case 'near-expiry':
        return {
          state,
          label: 'Por caducar',
          accentColor: 'var(--ion-color-warning)',
          chipColor: 'var(--ion-color-warning)',
          chipTextColor: 'var(--ion-text-color)',
        };
      case 'low-stock':
        return {
          state,
          label: 'Bajo stock',
          accentColor: 'var(--ion-color-warning)',
          chipColor: 'var(--ion-color-warning)',
          chipTextColor: 'var(--ion-color-dark)',
        };
      default:
        return {
          state: 'normal',
          label: 'Stock',
          accentColor: 'var(--ion-color-primary)',
          chipColor: 'var(--ion-color-primary)',
          chipTextColor: 'var(--ion-color-primary-contrast)',
        };
    }
  }

  private buildBatchSummaryLabel(counts: BatchCountsMeta): string {
    if (!counts.total) {
      return this.translate.instant('pantry.detail.batchSummary.none');
    }

    const descriptors: string[] = [];
    if (counts.expired) {
      const key =
        counts.expired === 1
          ? 'pantry.detail.batchSummary.expired.single'
          : 'pantry.detail.batchSummary.expired.plural';
      descriptors.push(this.translate.instant(key, { count: counts.expired }));
    }
    if (counts.nearExpiry) {
      const key =
        counts.nearExpiry === 1
          ? 'pantry.detail.batchSummary.nearExpiry.single'
          : 'pantry.detail.batchSummary.nearExpiry.plural';
      descriptors.push(this.translate.instant(key, { count: counts.nearExpiry }));
    }
    if (counts.normal) {
      const key =
        counts.normal === 1 ? 'pantry.detail.batchSummary.normal.single' : 'pantry.detail.batchSummary.normal.plural';
      descriptors.push(this.translate.instant(key, { count: counts.normal }));
    }
    if (counts.unknown) {
      const key =
        counts.unknown === 1
          ? 'pantry.detail.batchSummary.unknown.single'
          : 'pantry.detail.batchSummary.unknown.plural';
      descriptors.push(this.translate.instant(key, { count: counts.unknown }));
    }

    const totalLabel = this.translate.instant(
      counts.total === 1 ? 'pantry.detail.batchSummary.total.single' : 'pantry.detail.batchSummary.total.plural',
      { count: counts.total }
    );
    if (!descriptors.length) {
      return totalLabel;
    }

    return this.translate.instant('pantry.detail.batchSummary.withDescriptors', {
      total: totalLabel,
      descriptors: descriptors.join(', '),
    });
  }
}
