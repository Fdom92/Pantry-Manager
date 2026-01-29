import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import {
  buildFastAddItemPayload,
  classifyExpiry,
  computeEarliestExpiry,
  computeSupermarketSuggestions,
  formatCategoryName as formatCategoryNameCatalog,
  getPresetCategoryOptions,
  getPresetLocationOptions,
  getPresetSupermarketOptions,
  moveBatches,
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
  ItemLocationStock,
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
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { dedupeByNormalizedKey, normalizeEntityName } from '@core/utils/normalization.util';
import { findEntryByKey, toEntitySelectorEntries } from '@core/utils/entity-selector.util';

@Injectable()
export class PantryStateService {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly fb = inject(FormBuilder);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly confirm = inject(ConfirmService);

  // DATA
  readonly MeasurementUnit = MeasurementUnit;
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);
  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stockSaveDelay = 500;
  private readonly expandedItems = new Set<string>();
  private realtimeSubscribed = false;
  private readonly deleteAnimationDuration = 220;

  // SIGNALS / view state
  readonly loading = this.pantryService.loading;
  readonly hasCompletedInitialLoad = signal(false);
  readonly showFilters = signal(false);
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
    this.buildFastAddOptions(this.pantryItemsState(), this.fastAddEntries())
  );
  readonly showFastAddEmptyAction = computed(() => this.fastAddQuery().trim().length >= 1);
  readonly fastAddEmptyActionLabel = computed(() => this.buildFastAddEmptyActionLabel());

  // Move modal
  readonly showMoveModal = signal(false);
  readonly moveItemTarget = signal<PantryItem | null>(null);
  readonly moveSubmitting = signal(false);
  readonly moveError = signal<string | null>(null);

  // Batches modal
  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);

  // Pantry list data
  readonly pantryItemsState = signal<PantryItem[]>([]);
  readonly groups = computed(() => this.buildGroups(this.pantryItemsState()));

  // Filters state (mirrors PantryService)
  readonly searchTerm: Signal<string> = this.pantryService.searchQuery;
  readonly activeFilters: Signal<PantryFilterState> = this.pantryService.activeFilters;
  readonly sortOption: Signal<'name' | 'quantity' | 'expiration'> = this.pantryService.sortMode;
  readonly pipelineResetting: Signal<boolean> = this.pantryService.pipelineResetting;
  readonly selectedCategory = computed(() => this.activeFilters().categoryId ?? 'all');
  readonly selectedLocation = computed(() => this.activeFilters().locationId ?? 'all');
  readonly statusFilter = computed(() => this.getStatusFilterValue(this.activeFilters()));
  readonly basicOnly = computed(() => this.activeFilters().basic);

  // Summary + chips
  readonly summarySnapshot = signal<PantrySummaryMeta>(this.createEmptySummary());
  readonly summary = computed<PantrySummaryMeta>(() => this.summarySnapshot());
  readonly filterChips = computed(() => this.buildFilterChips(this.summary(), this.statusFilter(), this.basicOnly()));

  // Options
  readonly categoryOptions = computed(() => this.computeCategoryOptions(this.pantryItemsState()));
  readonly locationOptions = computed(() => this.computeLocationOptions(this.pantryItemsState()));
  readonly supermarketSuggestions = computed(() => this.computeSupermarketOptions(this.pantryItemsState()));
  readonly presetCategoryOptions = computed(() => this.computePresetCategoryOptions());
  readonly presetLocationOptions = computed(() => this.computePresetLocationOptions());
  readonly presetSupermarketOptions = computed(() => this.computePresetSupermarketOptions());

  // Batches
  readonly batchSummaries = computed(() => this.computeBatchSummaries(this.pantryItemsState()));

  // Forms (only those needed for moved flows)
  readonly moveForm = this.fb.group({
    fromLocation: this.fb.control('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    toLocation: this.fb.control('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    quantity: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0.01)],
    }),
  });

  constructor() {
    // Keep the UI in sync with the filtered pipeline, merging optimistic edits before rendering the list.
    effect(() => {
      const paginatedItems = this.pantryService.filteredProducts();
      this.pantryItemsState.set(this.mergePendingItems(paginatedItems));
    });

    effect(() => {
      const totalCount = this.pantryService.totalCount();
      const loadedItems = this.pantryService.loadedProducts();
      const isLoading = this.pantryService.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        this.summarySnapshot.set(this.buildSummary(loadedItems, totalCount));
      }
    });

    effect(() => {
      const categories = this.categoryOptions();
      const categoryFilter = this.activeFilters().categoryId;
      if (categoryFilter && !categories.some(option => option.id === categoryFilter)) {
        this.pantryService.setFilter('categoryId', null);
      }
    });

    effect(() => {
      const locations = this.locationOptions();
      const locationFilter = this.activeFilters().locationId;
      if (locationFilter && !locations.some(option => option.id === locationFilter)) {
        this.pantryService.setFilter('locationId', null);
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

  onCategoryChange(ev: CustomEvent): void {
    const raw = ev.detail?.value ?? 'all';
    this.pantryService.setFilter('categoryId', raw === 'all' ? null : raw);
  }

  onLocationChange(ev: CustomEvent): void {
    const raw = ev.detail?.value ?? 'all';
    this.pantryService.setFilter('locationId', raw === 'all' ? null : raw);
  }

  onSortChange(ev: CustomEvent): void {
    const mode = (ev.detail?.value ?? 'name') as 'name' | 'quantity' | 'expiration';
    this.pantryService.setSortMode(mode);
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

  openFilters(event?: Event): void {
    event?.preventDefault();
    this.showFilters.set(true);
  }

  closeFilters(): void {
    this.showFilters.set(false);
  }

  clearFilters(): void {
    this.pantryService.resetSearchAndFilters();
    this.pantryService.setSortMode('name');
    this.showFilters.set(false);
  }

  // -------- Edit item modal (request-based) --------
  openAdvancedAddModal(event?: Event): void {
    event?.stopPropagation();
    this.editItemModalRequest.set({ mode: 'create' });
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
      const nowIso = new Date().toISOString();
      const defaultLocationId = this.getDefaultLocationId();
      for (const entry of entries) {
        if (entry.isNew || !entry.item) {
          const item = buildFastAddItemPayload({
            id: createDocumentId('item'),
            nowIso,
            name: entry.name,
            quantity: entry.quantity,
            defaultLocationId,
          });
          await this.pantryStore.addItem(item);
          continue;
        }

        const unit = this.pantryStore.getItemPrimaryUnit(entry.item);
        const updated = await this.pantryService.addNewLot(entry.item._id, {
          quantity: entry.quantity,
          location: defaultLocationId,
          unit,
        });
        if (updated) {
          await this.pantryStore.updateItem(updated);
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
    const matchingItem = this.pantryItemsState()
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

  isLowStock(item: PantryItem): boolean {
    return this.pantryStore.isItemLowStock(item);
  }

  isExpired(item: PantryItem): boolean {
    return this.pantryStore.isItemExpired(item);
  }

  isNearExpiry(item: PantryItem): boolean {
    return this.pantryStore.isItemNearExpiry(item);
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
      location: entry.location,
      locationLabel: entry.locationLabel,
      status: entry.status,
      formattedDate: this.formatBatchDate(entry.batch),
      quantityLabel: this.formatBatchQuantity(entry.batch, entry.locationUnit),
      quantityValue: toNumberOrZero(entry.batch.quantity),
      unitLabel: this.getUnitLabel(normalizeUnitValue(entry.locationUnit)),
      opened: Boolean(entry.batch.opened),
    }));

    const lowStock = this.isLowStock(item);
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

  // -------- Move modal + logic --------
  openMoveItemModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    const candidates = this.getMoveSourceOptions(item);
    if (!candidates.length) {
      return;
    }
    const defaultFrom = candidates[0]?.value ?? '';
    const suggestedDestination = this.getSuggestedDestination(item, defaultFrom);
    const defaultQuantity = this.getAvailableQuantityFor(item, defaultFrom);
    this.moveForm.reset({
      fromLocation: defaultFrom,
      toLocation: suggestedDestination,
      quantity: defaultQuantity,
    });
    this.moveError.set(null);
    this.moveItemTarget.set(item);
    this.showMoveModal.set(true);
  }

  closeMoveItemModal(): void {
    if (this.showMoveModal()) {
      return;
    }
    this.showMoveModal.set(false);
    this.moveItemTarget.set(null);
    this.moveForm.reset({
      fromLocation: '',
      toLocation: '',
      quantity: null,
    });
    this.moveSubmitting.set(false);
    this.moveError.set(null);
  }

  dismissMoveItemModal(): void {
    this.showMoveModal.set(false);
  }

  onMoveSourceChange(): void {
    const item = this.moveItemTarget();
    if (!item) {
      return;
    }
    const fromId = this.moveForm.controls.fromLocation.value;
    const available = this.getAvailableQuantityFor(item, fromId);
    this.moveForm.patchValue({ quantity: available }, { emitEvent: false });
  }

  getMoveSourceOptions(item: PantryItem | null): Array<{ value: string; label: string; quantityLabel: string }> {
    if (!item) {
      return [];
    }
    return item.locations
      .map(location => {
        const total = this.getLocationTotal(location);
        if (total <= 0) {
          return null;
        }
        const quantityLabel =
          this.formatQuantityForMessage(total, location.unit ?? this.getPrimaryUnit(item)) ??
          formatQuantity(total, this.languageService.getCurrentLocale(), { maximumFractionDigits: 2 });
        return {
          value: location.locationId,
          label: this.getLocationLabel(location.locationId),
          quantityLabel,
        };
      })
      .filter((option): option is { value: string; label: string; quantityLabel: string } => Boolean(option?.value));
  }

  getMoveDestinationSuggestions(item: PantryItem | null): string[] {
    if (!item) {
      return [];
    }
    const exclude = normalizeKey(this.moveForm.controls.fromLocation.value ?? '');
    const seen = new Set<string>();
    const suggestions: string[] = [];
    const addSuggestion = (value: string | undefined | null): void => {
      const trimmed = (value ?? '').trim();
      if (!trimmed) {
        return;
      }
      const key = normalizeKey(trimmed);
      if (!key || key === exclude || seen.has(key)) {
        return;
      }
      seen.add(key);
      suggestions.push(trimmed);
    };

    for (const location of item.locations) {
      addSuggestion(location.locationId);
    }
    for (const preset of this.presetLocationOptions()) {
      addSuggestion(preset);
    }
    return suggestions.slice(0, 6);
  }

  applyMoveDestination(value: string): void {
    this.moveForm.patchValue({ toLocation: value });
  }

  getMoveAvailabilityLabel(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const fromId = this.moveForm.controls.fromLocation.value;
    const available = this.getAvailableQuantityFor(item, fromId);
    if (available <= 0) {
      return this.translate.instant('pantry.move.availability.empty');
    }
    const quantityLabel = this.formatQuantityForMessage(available, this.getLocationUnitForItem(item, fromId));
    if (!quantityLabel) {
      return '';
    }
    return this.translate.instant('pantry.move.availability.label', { value: quantityLabel });
  }

  async submitMoveItem(): Promise<void> {
    const targetItem = this.moveItemTarget();
    if (!targetItem) {
      return;
    }
    if (this.moveForm.invalid) {
      this.moveForm.markAllAsTouched();
      return;
    }

    const fromLocation = (this.moveForm.controls.fromLocation.value ?? '').trim();
    const toLocation = (this.moveForm.controls.toLocation.value ?? '').trim();
    const quantityInput = this.moveForm.controls.quantity.value;
    const requestedQuantity = toNumberOrZero(quantityInput);

    if (!fromLocation || !toLocation) {
      this.moveError.set(this.translate.instant('pantry.move.errors.missingLocations'));
      return;
    }
    if (normalizeKey(fromLocation) === normalizeKey(toLocation)) {
      this.moveError.set(this.translate.instant('pantry.move.errors.sameLocation'));
      return;
    }
    if (requestedQuantity <= 0) {
      this.moveError.set(this.translate.instant('pantry.move.errors.invalidQuantity'));
      return;
    }

    this.moveError.set(null);
    await withSignalFlag(this.moveSubmitting, async () => {
      const result = this.buildMoveResult(targetItem, fromLocation, toLocation, requestedQuantity);
      if (!result) {
        this.moveError.set(this.translate.instant('pantry.move.errors.noAvailableStock'));
        return;
      }

      this.pantryItemsState.update(items =>
        items.map(existing => (existing._id === result.updatedItem._id ? result.updatedItem : existing))
      );
      this.triggerStockSave(result.updatedItem._id, result.updatedItem);

      this.dismissMoveItemModal();
    }).catch(err => {
      console.error('[PantryListStateService] submitMoveItem error', err);
      this.moveError.set(this.translate.instant('pantry.move.errors.generic'));
    });
  }

  // -------- Stock pending + debounce --------
  async adjustBatchQuantity(
    item: PantryItem,
    location: ItemLocationStock,
    batch: ItemBatch,
    delta: number,
    event?: Event
  ): Promise<void> {
    event?.stopPropagation();
    if (!item?._id || !location?.locationId || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    const unit = normalizeUnitValue(location.unit ?? this.pantryStore.getItemPrimaryUnit(item));
    const originalBatches = Array.isArray(location.batches) ? location.batches : [];
    const targetIndex = originalBatches.indexOf(batch);
    const sanitizedBatches = this.sanitizeBatches(location.batches, unit);
    const batchIndex = targetIndex >= 0 ? targetIndex : sanitizedBatches.findIndex(entry => entry.batchId === batch.batchId);

    if (batchIndex < 0) {
      return;
    }

    const previousTotal = this.sumBatchQuantities(sanitizedBatches);
    const currentBatchQuantity = toNumberOrZero(sanitizedBatches[batchIndex].quantity);
    const nextBatchQuantity = roundQuantity(Math.max(0, currentBatchQuantity + delta));

    if (nextBatchQuantity === currentBatchQuantity) {
      return;
    }

    if (nextBatchQuantity <= 0) {
      sanitizedBatches.splice(batchIndex, 1);
    } else {
      sanitizedBatches[batchIndex] = {
        ...sanitizedBatches[batchIndex],
        quantity: nextBatchQuantity,
      };
    }

    const nextTotal = this.sumBatchQuantities(sanitizedBatches);
    const updatedItem = this.applyLocationBatches(item, location.locationId, sanitizedBatches);
    if (!updatedItem) {
      return;
    }

    await this.provideQuantityFeedback(previousTotal, nextTotal);
    this.triggerStockSave(item._id, updatedItem);

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
        locations: pending.locations,
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

  private updateLocationTotals(locations: ItemLocationStock[]): ItemLocationStock[] {
    return locations.map(location => {
      const unit = normalizeUnitValue(location.unit);
      return {
        ...location,
        unit,
        batches: this.sanitizeBatches(location.batches, unit),
      };
    });
  }

  private rebuildItemWithLocations(item: PantryItem, locations: ItemLocationStock[]): PantryItem {
    const normalizedLocations = this.updateLocationTotals(locations);
    return {
      ...item,
      locations: normalizedLocations,
      expirationDate: computeEarliestExpiry(normalizedLocations),
      updatedAt: new Date().toISOString(),
    };
  }

  private applyLocationBatches(item: PantryItem, locationId: string, batches: ItemBatch[]): PantryItem | null {
    const unitFallback = normalizeUnitValue(
      item.locations.find(loc => loc.locationId === locationId)?.unit ?? this.getPrimaryUnit(item)
    );

    let found = false;
    const nextLocations = item.locations.map(loc => {
      if (loc.locationId === locationId) {
        found = true;
        const normalizedUnit = normalizeUnitValue(loc.unit ?? unitFallback);
        return {
          ...loc,
          unit: normalizedUnit,
          batches: this.sanitizeBatches(batches, normalizedUnit),
        };
      }
      return loc;
    });

    if (!found) {
      const normalizedUnit = normalizeUnitValue(unitFallback);
      nextLocations.push({
        locationId,
        unit: normalizedUnit,
        batches: this.sanitizeBatches(batches, normalizedUnit),
      });
    }

    const rebuilt = this.rebuildItemWithLocations(item, nextLocations);
    this.pantryItemsState.update(items =>
      items.map(existing => (existing._id === rebuilt._id ? rebuilt : existing))
    );
    return rebuilt;
  }

  private triggerStockSave(itemId: string, updated: PantryItem): void {
    this.pendingItems.set(itemId, updated);
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
                locations: pending.locations,
                expirationDate: pending.expirationDate ?? latest.expirationDate,
                updatedAt: pending.updatedAt ?? new Date().toISOString(),
              }
            : pending;

          await this.pantryStore.updateItem(nextPayload);
        } catch (err) {
          console.error('[PantryListStateService] updateItem error', err);
        } finally {
          this.pendingItems.delete(itemId);
        }
      }
      this.stockSaveTimers.delete(itemId);
    }, this.stockSaveDelay);

    this.stockSaveTimers.set(itemId, timer);
  }

  private cancelPendingStockSaveInternal(itemId: string): void {
    const existingTimer = this.stockSaveTimers.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.stockSaveTimers.delete(itemId);
    }
    this.pendingItems.delete(itemId);
  }

  private clearStockSaveTimers(): void {
    for (const timer of this.stockSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.stockSaveTimers.clear();
    this.pendingItems.clear();
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

  private formatQuantityForMessage(quantity?: number | null, unit?: MeasurementUnit | string | null): string | null {
    if (quantity == null || Number.isNaN(Number(quantity))) {
      return null;
    }
    const formattedNumber = formatQuantity(quantity, this.languageService.getCurrentLocale(), {
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(normalizeUnitValue(unit ?? undefined));
    return `${formattedNumber} ${unitLabel}`.trim();
  }

  private getLocationTotal(location: ItemLocationStock): number {
    return this.sumBatchQuantities(location.batches);
  }

  private getAvailableQuantityFor(item: PantryItem, locationId: string): number {
    return this.getLocationTotal(
      item.locations.find(loc => normalizeKey(loc.locationId) === normalizeKey(locationId)) ?? {
        locationId: '',
        unit: this.getPrimaryUnit(item),
        batches: [],
      }
    );
  }

  private getLocationUnitForItem(item: PantryItem, locationId: string): string {
    const location = item.locations.find(loc => normalizeKey(loc.locationId) === normalizeKey(locationId));
    return normalizeUnitValue(location?.unit ?? this.getPrimaryUnit(item));
  }

  private getSuggestedDestination(item: PantryItem, fromId: string): string {
    const normalizedFrom = normalizeKey(fromId);
    const alternative = item.locations.find(loc => normalizeKey(loc.locationId) !== normalizedFrom)?.locationId;
    if (alternative) {
      return alternative;
    }
    const presets = this.presetLocationOptions();
    const presetOption = presets.find(option => normalizeKey(option) !== normalizedFrom);
    if (presetOption) {
      return presetOption;
    }
    return this.getDefaultLocationId();
  }

  private buildMoveResult(
    item: PantryItem,
    fromLocationId: string,
    toLocationId: string,
    requestedQuantity: number
  ): { updatedItem: PantryItem; quantityLabel: string; fromLabel: string; toLabel: string } | null {
    const normalizedFrom = normalizeKey(fromLocationId);
    const normalizedTo = normalizeKey(toLocationId);
    if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
      return null;
    }

    const source = item.locations.find(loc => normalizeKey(loc.locationId) === normalizedFrom);
    if (!source) {
      return null;
    }

    const unit = normalizeUnitValue(source.unit ?? this.getPrimaryUnit(item));
    const sanitizedSource = this.sanitizeBatches(source.batches, unit);
    const available = this.sumBatchQuantities(sanitizedSource);
    if (available <= 0) {
      return null;
    }

    const amountToMove = roundQuantity(Math.min(Math.max(requestedQuantity, 0), available));
    if (amountToMove <= 0) {
      return null;
    }

    const destination = item.locations.find(loc => normalizeKey(loc.locationId) === normalizedTo);
    const destinationUnit = normalizeUnitValue(destination?.unit ?? unit);
    const sanitizedDestination = this.sanitizeBatches(destination?.batches, destinationUnit);
    const { moved, remainingSource, nextDestination } = moveBatches({
      source: sanitizedSource,
      destination: sanitizedDestination,
      amount: amountToMove,
      round: roundQuantity,
    });

    if (moved.length === 0) {
      return null;
    }

    const remaining = remainingSource;
    const mergedDestination = nextDestination;

    const nextLocations = item.locations.filter(
      loc => normalizeKey(loc.locationId) !== normalizedFrom && normalizeKey(loc.locationId) !== normalizedTo
    );

    if (this.sumBatchQuantities(remaining) > 0) {
      nextLocations.push({
        ...source,
        batches: remaining,
        unit,
      });
    }

    if (this.sumBatchQuantities(mergedDestination) > 0) {
      nextLocations.push({
        ...(destination ?? { locationId: toLocationId, unit: destinationUnit, batches: [] }),
        locationId: destination?.locationId ?? toLocationId,
        batches: mergedDestination,
        unit: destinationUnit,
      });
    }

    const updatedItem = this.rebuildItemWithLocations(item, nextLocations);
    const quantityLabel =
      this.formatQuantityForMessage(amountToMove, unit) ??
      `${roundQuantity(amountToMove)} ${this.getUnitLabel(unit)}`;

    return {
      updatedItem,
      quantityLabel,
      fromLabel: normalizeLocationId(
        source.locationId,
        this.translate.instant('common.locations.none')
      ),
      toLabel: normalizeLocationId(
        toLocationId,
        this.translate.instant('common.locations.none')
      ),
    };
  }

  // -------- Summary / grouping / options --------
  private buildSummary(items: PantryItem[], totalCount: number): PantrySummaryMeta {
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
      const state = this.getItemStatusState(item);
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

  private getItemStatusState(item: PantryItem): ProductStatusState {
    if (this.isExpired(item)) {
      return 'expired';
    }
    if (this.isNearExpiry(item)) {
      return 'near-expiry';
    }
    if (this.isLowStock(item)) {
      return 'low-stock';
    }
    return 'normal';
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

  private computeLocationOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number }> {
    const counts = new Map<string, { label: string; count: number }>();

    for (const item of items) {
      const seen = new Set<string>();
      for (const location of item.locations) {
        const id = normalizeLocationId(location.locationId);
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const label = normalizeLocationId(id, this.translate.instant('common.locations.none'));
        const current = counts.get(id);
        if (current) {
          current.count += 1;
        } else {
          counts.set(id, { label, count: 1 });
        }
      }
    }

    const mapped = Array.from(counts.entries())
      .map(([id, meta]) => ({ id, label: meta.label, count: meta.count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { id: 'all', label: this.translate.instant('pantry.filters.all'), count: items.length },
      ...mapped,
    ];
  }

  private computeSupermarketOptions(items: PantryItem[]): string[] {
    return computeSupermarketSuggestions(items);
  }

  private computePresetCategoryOptions(): string[] {
    return getPresetCategoryOptions(this.appPreferences.preferences());
  }

  private computePresetLocationOptions(): string[] {
    return getPresetLocationOptions(this.appPreferences.preferences());
  }

  private computePresetSupermarketOptions(): string[] {
    return getPresetSupermarketOptions(this.appPreferences.preferences());
  }

  private computeCategoryOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number; lowCount: number }> {
    const counts = new Map<string, { label: string; count: number; lowCount: number }>();
    const presets = this.presetCategoryOptions();

    for (const preset of presets) {
      const id = preset.trim();
      if (!counts.has(id)) {
        counts.set(id, { label: this.formatCategoryName(id), count: 0, lowCount: 0 });
      }
    }

    if (!counts.has('')) {
      counts.set('', {
        label: this.translate.instant('pantry.form.uncategorized'),
        count: 0,
        lowCount: 0,
      });
    }

    for (const item of items) {
      const id = normalizeCategoryId(item.categoryId);
      const label = this.formatCategoryName(id);
      const current = counts.get(id);
      if (current) {
        current.count += 1;
        if (this.isLowStock(item)) {
          current.lowCount += 1;
        }
      } else {
        counts.set(id, {
          label,
          count: 1,
          lowCount: this.isLowStock(item) ? 1 : 0,
        });
      }
    }

    const mapped = Array.from(counts.entries())
      .map(([id, meta]) => ({ id, label: meta.label, count: meta.count, lowCount: meta.lowCount }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const lowTotal = mapped.reduce((acc, option) => acc + option.lowCount, 0);
    return [
      { id: 'all', label: this.translate.instant('pantry.filters.all'), count: items.length, lowCount: lowTotal },
      ...mapped
    ];
  }

  private buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();

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
      if (this.isLowStock(item)) {
        group.lowStockCount += 1;
      }
      if (this.isExpired(item)) {
        group.expiredCount += 1;
      } else if (this.isNearExpiry(item)) {
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
    const sortOption = this.sortOption();
    const expirationWeightDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationWeightDiff !== 0) {
      return expirationWeightDiff;
    }

    switch (sortOption) {
      case 'quantity': {
        const quantityDiff = this.getTotalQuantity(b) - this.getTotalQuantity(a);
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

    return (a.name ?? '').localeCompare(b.name ?? '');
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
    const expiry = computeEarliestExpiry(item.locations);
    if (!expiry) {
      return Number.MAX_SAFE_INTEGER;
    }
    return new Date(expiry).getTime();
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
    return 'unassigned';
  }

  // -------- Batch summaries internal --------
  private getBatchSummary(item: PantryItem): BatchSummaryMeta {
    return this.batchSummaries().get(item._id) ?? { total: 0, sorted: [] };
  }

  private collectBatches(item: PantryItem): BatchEntryMeta[] {
    const batches: BatchEntryMeta[] = [];
    for (const location of item.locations) {
      const locationLabel = this.getLocationLabel(location.locationId);
      const locationUnit = normalizeUnitValue(location.unit);
      const entries = Array.isArray(location.batches) ? location.batches : [];
      for (const batch of entries) {
        batches.push({
          batch,
          location,
          locationLabel,
          locationUnit,
          status: this.getBatchStatus(batch),
        });
      }
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
          location: entry.location,
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
