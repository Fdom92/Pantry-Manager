import { Component, OnDestroy, ChangeDetectionStrategy, signal, computed, effect, ViewChild, Signal } from '@angular/core';
import { IonicModule, IonContent, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import {
  AppPreferencesService,
  DEFAULT_LOCATION_OPTIONS,
  DEFAULT_SUPERMARKET_OPTIONS,
} from '@core/services';
import {
  PantryItem,
  MeasurementUnit,
  ItemLocationStock,
  ItemBatch,
  PantryGroup,
  BatchStatusMeta,
  BatchEntryMeta,
  BatchSummaryMeta,
  BatchCountsMeta,
  ProductStatusState,
  PantryItemGlobalStatus,
  PantryItemBatchViewModel,
  PantryItemCardViewModel,
  ES_DATE_FORMAT_OPTIONS,
} from '@core/models';
import { createDocumentId, getLocationDisplayName } from '@core/utils';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PantryStoreService } from '@core/store/pantry-store.service';
import { PantryService } from '@core/services/pantry.service';
import { PantryFilterState } from '@core/models/pantry-pipeline.model';
import { PantryDetailComponent } from '../pantry-detail/pantry-detail.component';

type PantryStatusFilterValue = 'all' | 'expired' | 'near-expiry' | 'low-stock' | 'normal';

interface StatusChipViewModel {
  value: PantryStatusFilterValue;
  label: string;
  count: number;
  icon: string;
  description: string;
  colorClass: string;
}

interface PantrySummaryMeta {
  total: number;
  visible: number;
  statusCounts: {
    expired: number;
    expiring: number;
    lowStock: number;
    normal: number;
  };
}

@Component({
  selector: 'app-pantry-list',
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule, PantryDetailComponent],
  templateUrl: './pantry-list.component.html',
  styleUrls: ['./pantry-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryListComponent implements OnDestroy {
  @ViewChild('content', { static: false }) private content?: IonContent;
  readonly searchTerm: Signal<string>;
  readonly activeFilters: Signal<PantryFilterState>;
  readonly selectedCategory: Signal<string>;
  readonly selectedLocation: Signal<string>;
  readonly sortOption: Signal<'name' | 'quantity' | 'expiration'>;
  readonly statusFilter: Signal<PantryStatusFilterValue>;
  readonly showFilters = signal(false);
  readonly basicOnly: Signal<boolean>;
  readonly lowStockOnly: Signal<boolean>;
  readonly itemsState = signal<PantryItem[]>([]);
  readonly groups = computed(() => this.buildGroups(this.itemsState()));
  private readonly summaryCache = signal<PantrySummaryMeta>(this.createEmptySummary());
  readonly summary = computed<PantrySummaryMeta>(() => this.summaryCache());
  readonly statusChips = computed(() => this.buildStatusChips(this.summary()));
  readonly categoryOptions = computed(() => this.computeCategoryOptions(this.itemsState()));
  readonly locationOptions = computed(() => this.computeLocationOptions(this.itemsState()));
  readonly supermarketSuggestions = computed(() => this.computeSupermarketOptions(this.itemsState()));
  readonly presetLocationOptions = computed(() => this.computePresetLocationOptions());
  readonly presetSupermarketOptions = computed(() => this.computePresetSupermarketOptions());
  readonly batchSummaries = computed(() => this.computeBatchSummaries(this.itemsState()));
  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);
  readonly loading = this.pantryService.loading;
  readonly nearExpiryDays = 7;
  readonly MeasurementUnit = MeasurementUnit;
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);
  showCreateModal = false;
  editingItem: PantryItem | null = null;
  isSaving = false;
  private readonly expandedItems = new Set<string>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveDelay = 500;
  private realtimeSubscribed = false;
  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    categoryId: this.fb.control(''),
    supermarket: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(80)],
      nonNullable: true,
    }),
    isBasic: this.fb.control(false),
    minThreshold: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    notes: this.fb.control(''),
    locations: this.fb.array([
      this.createLocationGroup({
        locationId: '',
        unit: MeasurementUnit.UNIT,
        batches: [],
      })
    ])
  });

  get locationsArray(): FormArray<FormGroup> {
    return this.form.get('locations') as FormArray<FormGroup>;
  }

  getBatchesArray(locationIndex: number): FormArray<FormGroup> {
    const control = this.locationsArray.at(locationIndex).get('batches');
    if (control instanceof FormArray) {
      return control as FormArray<FormGroup>;
    }

    const batches = this.fb.array<FormGroup>([]);
    this.locationsArray.at(locationIndex).setControl('batches', batches);
    return batches;
  }

  addBatchEntry(locationIndex: number): void {
    const batches = this.getBatchesArray(locationIndex);
    batches.push(this.createBatchGroup());
  }

  removeBatchEntry(locationIndex: number, batchIndex: number): void {
    const batches = this.getBatchesArray(locationIndex);
    if (batchIndex < 0 || batchIndex >= batches.length) {
      return;
    }
    batches.removeAt(batchIndex);
  }
  constructor(
    private readonly pantryStore: PantryStoreService,
    private readonly pantryService: PantryService,
    private readonly fb: FormBuilder,
    private readonly toastCtrl: ToastController,
    private readonly appPreferences: AppPreferencesService,
  ) {
    this.searchTerm = this.pantryService.searchQuery;
    this.activeFilters = this.pantryService.activeFilters;
    this.sortOption = this.pantryService.sortMode;
    this.selectedCategory = computed(() => this.activeFilters().categoryId ?? 'all');
    this.selectedLocation = computed(() => this.activeFilters().locationId ?? 'all');
    this.statusFilter = computed(() => this.getStatusFilterValue(this.activeFilters()));
    this.basicOnly = computed(() => this.activeFilters().basic);
    this.lowStockOnly = computed(() => this.activeFilters().lowStock);

    // Keep the UI in sync with the filtered pipeline, merging optimistic edits before rendering the list.
    effect(() => {
      const paginatedItems = this.pantryService.filteredProducts();
      this.itemsState.set(this.mergePendingItems(paginatedItems));
    });

    // Expansion toggles depend on ids that might disappear when new batches arrive.
    effect(() => {
      this.syncExpandedItems(this.itemsState());
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

    effect(() => {
      const totalCount = this.pantryService.totalCount();
      const loadedItems = this.pantryService.loadedProducts();
      const isLoading = this.pantryService.loading();
      const shouldUseFreshSummary = !isLoading || loadedItems.length > 0 || totalCount === 0;
      if (shouldUseFreshSummary) {
        this.summaryCache.set(this.buildSummary(loadedItems, totalCount));
      }
    });
  }

  /** Lifecycle hook: ensure the store is primed and real-time updates are wired. */
  async ionViewWillEnter() {
    await this.loadItems();
    if (!this.realtimeSubscribed) {
      this.pantryStore.watchRealtime();
      this.realtimeSubscribed = true;
    }
  }

  /** Convenience wrapper used by multiple entry points to reload the list. */
  async loadItems(): Promise<void> {
    if (this.pantryService.loadedProducts().length === 0) {
      await this.pantryService.reloadFromStart();
    }
    this.scrollViewportToTop();
  }

  /** Open the creation modal with blank defaults and a single location row. */
  openNewItemModal(): void {
    this.editingItem = null;
    this.form.reset({
      name: '',
      categoryId: '',
      supermarket: '',
      isBasic: false,
      minThreshold: null,
      notes: ''
    });
    this.resetLocationControls([
      {
        locationId: '',
        unit: MeasurementUnit.UNIT,
        batches: [],
      }
    ]);
    this.showCreateModal = true;
  }

  openEditItemModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.editingItem = item;
    this.form.reset({
      name: item.name ?? '',
      categoryId: item.categoryId ?? '',
      supermarket: item.supermarket ?? '',
      isBasic: Boolean(item.isBasic),
      minThreshold: item.minThreshold ?? null,
      notes: ''
    });
    const locations = item.locations.length
      ? item.locations
      : [{
          locationId: '',
          quantity: 0,
          unit: this.pantryStore.getItemPrimaryUnit(item),
          batches: [],
        }];
    this.resetLocationControls(locations);
    this.showCreateModal = true;
  }

  /** Append a new empty location group so the user can split stock. */
  addLocationEntry(): void {
    this.locationsArray.push(this.createLocationGroup());
  }

  /** Remove the requested location, keeping at least one so the form stays valid. */
  removeLocationEntry(index: number): void {
    if (this.locationsArray.length <= 1) {
      return;
    }
    this.locationsArray.removeAt(index);
  }

  /** Replace the current form array with normalized groups based on the provided data. */
  private resetLocationControls(locations: Array<Partial<ItemLocationStock>>): void {
    while (this.locationsArray.length) {
      this.locationsArray.removeAt(0);
    }
    for (const location of locations) {
      this.locationsArray.push(this.createLocationGroup(location));
    }
  }

  /** Create a form group for a single location with coercion and sane defaults. */
  private createLocationGroup(initial?: Partial<ItemLocationStock>): FormGroup {
    const batches = Array.isArray(initial?.batches) ? initial.batches : [];
    const rawLocation = (initial?.locationId ?? '').trim();
    const locationId = rawLocation && rawLocation !== 'unassigned' ? rawLocation : '';
    return this.fb.group({
      locationId: this.fb.control(locationId, {
        validators: [Validators.required],
        nonNullable: true,
      }),
      unit: this.fb.control<string>(this.normalizeUnitValue(initial?.unit), {
        nonNullable: true,
      }),
      batches: this.fb.array(
        batches.map(batch => this.createBatchGroup(batch))
      ),
    });
  }

  private createBatchGroup(initial?: Partial<ItemBatch>): FormGroup {
    let normalizedQuantity: number | null = null;
    if (initial?.quantity != null) {
      const numericValue = Number(initial.quantity);
      normalizedQuantity = Number.isFinite(numericValue) ? numericValue : null;
    }
    return this.fb.group({
      batchId: this.fb.control((initial?.batchId ?? '').trim()),
      quantity: this.fb.control<number | null>(
        normalizedQuantity,
        {
          validators: [Validators.required, Validators.min(0)],
        }
      ),
      expirationDate: this.fb.control(initial?.expirationDate ? this.toDateInputValue(initial.expirationDate) : ''),
      opened: this.fb.control(initial?.opened ?? false),
    });
  }

  closeFormModal(): void {
    this.showCreateModal = false;
    this.isSaving = false;
    this.editingItem = null;
  }

  /**
   * Persist the form payload, close the modal, and surface contextual feedback.
   * Handles both creation and update flows through the store.
   */
  async submitItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const item = this.buildItemPayload(this.editingItem ?? undefined);
      const previous = this.editingItem;
      let successMessage: string;
      if (previous) {
        await this.pantryStore.updateItem(item);
        successMessage = this.buildUpdateSuccessMessage(previous, item);
      } else {
        await this.pantryStore.addItem(item);
        successMessage = this.buildCreateSuccessMessage(item);
      }
      this.closeFormModal();
      await this.presentToast(successMessage, 'success');
    } catch (err) {
      this.isSaving = false;
      if (err instanceof Error && err.message === 'LOCATION_REQUIRED') {
        await this.presentToast('Selecciona una ubicación antes de guardar.', 'danger');
        return;
      }
      if (err instanceof Error && err.message === 'SUPERMARKET_REQUIRED') {
        await this.presentToast('Selecciona un supermercado antes de guardar.', 'danger');
        return;
      }
      console.error('[PantryListComponent] submitItem error', err);
      await this.presentToast('Error saving item', 'danger');
    }
  }

  async deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }
    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';
    if (shouldConfirm) {
      const confirmed = window.confirm(`Delete "${item.name}"?`);
      if (!confirmed) {
        return;
      }
    }

    await this.pantryStore.deleteItem(item._id);
    this.expandedItems.delete(item._id);
    await this.presentToast('🗑️ Producto eliminado.', 'medium');
  }

  /**
   * Apply a quantity delta directly to a single batch and refresh the derived totals/state.
   * Keeps the item signal in sync without forcing a full reload.
   */
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

    const unit = this.normalizeUnitValue(location.unit ?? this.pantryStore.getItemPrimaryUnit(item));
    const originalBatches = Array.isArray(location.batches) ? location.batches : [];
    const targetIndex = originalBatches.indexOf(batch);
    const sanitizedBatches = this.sanitizeBatches(location.batches, unit);
    const batchIndex = targetIndex >= 0 ? targetIndex : sanitizedBatches.findIndex(entry => entry.batchId === batch.batchId);

    if (batchIndex < 0) {
      return;
    }

    const previousTotal = this.sumBatchQuantities(sanitizedBatches);
    const currentBatchQuantity = this.toNumber(sanitizedBatches[batchIndex].quantity);
    const nextBatchQuantity = this.roundDisplayQuantity(Math.max(0, currentBatchQuantity + delta));

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
    const updatedItem = this.applyLocationBatches(item._id, location.locationId, sanitizedBatches);
    if (!updatedItem) {
      return;
    }

    await this.provideQuantityFeedback(previousTotal, nextTotal);
    this.triggerStockSave(item._id, updatedItem);

    if (previousTotal > 0 && nextTotal === 0) {
      await this.presentToast(`"${updatedItem.name}" added to shopping list suggestions`, 'success');
    }
  }

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

  onStatusFilterChange(ev: CustomEvent): void {
    const value = (ev.detail?.value ?? 'all') as PantryStatusFilterValue;
    this.applyStatusFilterPreset(value);
  }

  onStatusChipSelected(value: PantryStatusFilterValue): void {
    this.applyStatusFilterPreset(value);
  }

  onSortChange(ev: CustomEvent): void {
    const mode = (ev.detail?.value ?? 'name') as 'name' | 'quantity' | 'expiration';
    this.pantryService.setSortMode(mode);
  }

  toggleBasicOnly(ev: CustomEvent<{ checked: boolean }>): void {
    this.pantryService.setFilter('basic', Boolean(ev.detail?.checked));
  }

  toggleLowStockOnly(ev: CustomEvent<{ checked: boolean }>): void {
    const checked = Boolean(ev.detail?.checked);
    if (checked) {
      this.pantryService.setFilters({ lowStock: true, normalOnly: false });
    } else {
      this.pantryService.setFilter('lowStock', false);
    }
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
    this.scrollViewportToTop();
  }

  private applyStatusFilterPreset(preset: PantryStatusFilterValue): void {
    switch (preset) {
      case 'expired':
        this.pantryService.setFilters({ expired: true, expiring: false, lowStock: false, normalOnly: false });
        break;
      case 'near-expiry':
        this.pantryService.setFilters({ expired: false, expiring: true, lowStock: false, normalOnly: false });
        break;
      case 'low-stock':
        this.pantryService.setFilters({ expired: false, expiring: false, lowStock: true, normalOnly: false });
        break;
      case 'normal':
        this.pantryService.setFilters({ expired: false, expiring: false, lowStock: false, normalOnly: true });
        break;
      default:
        this.pantryService.setFilters({ expired: false, expiring: false, lowStock: false, normalOnly: false });
        break;
    }
  }

  async discardExpiredItem(item: PantryItem, event?: Event): Promise<void> {
    if (!this.isExpired(item)) {
      return;
    }
    await this.deleteItem(item, event, true);
  }

  getTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
  }

  getPrimaryUnit(item: PantryItem): string {
    return this.normalizeUnitValue(this.pantryStore.getItemPrimaryUnit(item));
  }

  getUnitLabelForItem(item: PantryItem): string {
    return this.pantryStore.getUnitLabel(this.getPrimaryUnit(item));
  }

  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getLocationLabel(locationId: string | undefined): string {
    return getLocationDisplayName(locationId, 'Sin ubicación');
  }

  onSummaryKeydown(item: PantryItem, event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      this.toggleItemExpansion(item);
    }
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

  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  isExpanded(item: PantryItem): boolean {
    return this.expandedItems.has(item._id);
  }

  /** Toggle the expansion panel for a given item without triggering parent handlers. */
  toggleItemExpansion(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedItems.has(item._id)) {
      this.expandedItems.delete(item._id);
    } else {
      this.expandedItems.add(item._id);
    }
  }

  /** Scroll to the top of the list after reloading or clearing filters. */
  private scrollViewportToTop(): void {
    this.content?.scrollToTop(300);
  }

  openBatchesModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectedBatchesItem.set(item);
    this.showBatchesModal.set(true);
  }

  closeBatchesModal(): void {
    this.showBatchesModal.set(false);
    this.selectedBatchesItem.set(null);
  }

  /** Sort items by urgency (expiry/quantity) and finally by name for stable output. */
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
    const expiry = this.computeEarliestExpiry(item.locations);
    if (!expiry) {
      return Number.MAX_SAFE_INTEGER;
    }
    return new Date(expiry).getTime();
  }

  /** Aggregate counts for the summary bar shown above the list. */
  private buildSummary(items: PantryItem[], totalCount: number): PantrySummaryMeta {
    const statusCounts = {
      expired: 0,
      expiring: 0,
      lowStock: 0,
      normal: 0,
    };

    for (const item of items) {
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
      statusCounts,
    };
  }

  private createEmptySummary(): PantrySummaryMeta {
    return {
      total: 0,
      visible: 0,
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

  private buildStatusChips(summary: PantrySummaryMeta): StatusChipViewModel[] {
    const counts = summary.statusCounts;
    return [
      {
        value: 'all',
        label: 'Todos',
        count: summary.total,
        icon: 'layers-outline',
        description: 'Ver todos los productos disponibles',
        colorClass: 'chip--all',
      },
      {
        value: 'normal',
        label: 'Con stock',
        count: counts.normal,
        icon: 'checkmark-circle-outline',
        description: 'Productos sin alertas activas',
        colorClass: 'chip--normal',
      },
      {
        value: 'low-stock',
        label: 'Stock bajo',
        count: counts.lowStock,
        icon: 'alert-circle-outline',
        description: 'Necesitan reposición pronto',
        colorClass: 'chip--low',
      },
      {
        value: 'near-expiry',
        label: 'Próx. caducar',
        count: counts.expiring,
        icon: 'hourglass-outline',
        description: 'Caducan en pocos días',
        colorClass: 'chip--expiring',
      },
      {
        value: 'expired',
        label: 'Caducados',
        count: counts.expired,
        icon: 'time-outline',
        description: 'Revisar y descartar',
        colorClass: 'chip--expired',
      },
    ];
  }

  /** Build select options that indicate how many items belong to each location. */
  private computeLocationOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number }> {
    const counts = new Map<string, { label: string; count: number }>();

    for (const item of items) {
      const seen = new Set<string>();
      for (const location of item.locations) {
        const id = (location.locationId ?? '').trim();
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const label = getLocationDisplayName(id, 'Sin ubicación');
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
      { id: 'all', label: `Todas`, count: items.length },
      ...mapped
    ];
  }

  private computeSupermarketOptions(items: PantryItem[]): string[] {
    const options = new Map<string, string>();
    for (const item of items) {
      const value = (item.supermarket ?? '').trim();
      if (!value) {
        continue;
      }
      const normalizedValue = value.replace(/\s+/g, ' ');
      const key = normalizedValue.toLowerCase();
      if (!options.has(key)) {
        options.set(key, normalizedValue);
      }
    }
    return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
  }

  getLocationOptionsForControl(index: number): Array<{ value: string; label: string }> {
    const presetOptions = this.presetLocationOptions();
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const addOption = (value: string, label?: string): void => {
      const normalized = this.normalizeKey(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const display = label ?? getLocationDisplayName(value, 'Sin ubicación');
      options.push({ value, label: display });
    };

    for (const preset of presetOptions) {
      addOption(preset);
    }

    const control = this.locationsArray.at(index);
    const currentValue = (control?.get('locationId')?.value ?? '').trim();
    if (currentValue && !seen.has(this.normalizeKey(currentValue))) {
      addOption(currentValue);
    }

    return options;
  }

  getSupermarketSelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = this.presetSupermarketOptions();
    const suggestions = this.supermarketSuggestions();
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const addOption = (value: string, label?: string): void => {
      const normalized = this.normalizeKey(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const trimmedValue = value.trim();
      const display = label ?? trimmedValue;
      options.push({ value: trimmedValue, label: display });
    };

    for (const preset of presetOptions) {
      addOption(preset);
    }

    for (const suggestion of suggestions) {
      addOption(suggestion);
    }

    const control = this.form.get('supermarket');
    const currentValue = (control?.value ?? '').trim();
    if (currentValue && !seen.has(this.normalizeKey(currentValue))) {
      addOption(currentValue);
    }

    return options;
  }

  private computePresetLocationOptions(): string[] {
    const prefs = this.appPreferences.preferences();
    const source = Array.isArray(prefs.locationOptions) ? prefs.locationOptions : [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const option of source) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = this.normalizeKey(trimmed);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }

    if (!normalized.length) {
      return [...DEFAULT_LOCATION_OPTIONS];
    }

    return normalized;
  }

  private computePresetSupermarketOptions(): string[] {
    const prefs = this.appPreferences.preferences();
    const source = Array.isArray(prefs.supermarketOptions) ? prefs.supermarketOptions : [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const option of source) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = this.normalizeKey(trimmed);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }

    if (!normalized.length) {
      return [...DEFAULT_SUPERMARKET_OPTIONS];
    }

    return normalized;
  }

  private normalizeKey(value: string): string {
    return value.trim().toLowerCase();
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

  getTotalBatchCount(item: PantryItem): number {
    return this.getBatchSummary(item).total;
  }

  hasMultipleBatches(item: PantryItem): boolean {
    return this.getTotalBatchCount(item) > 1;
  }

  getTopBatches(item: PantryItem, limit: number = 3): BatchEntryMeta[] {
    return this.getBatchSummary(item).sorted.slice(0, limit);
  }

  getSortedBatches(item: PantryItem): BatchEntryMeta[] {
    return this.getBatchSummary(item).sorted;
  }

  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel {
    const totalQuantity = this.getTotalQuantity(item);
    const unitLabel = this.getUnitLabelForItem(item);
    const totalBatches = this.getTotalBatchCount(item);
    const formattedQuantityValue = this.roundDisplayQuantity(totalQuantity).toLocaleString('es-ES', {
      maximumFractionDigits: 2,
    });
    const baseQuantityLabel = unitLabel ? `${formattedQuantityValue} ${unitLabel}` : formattedQuantityValue;
    const totalQuantityLabel = `${baseQuantityLabel} total`;
    const totalBatchesLabel = totalBatches === 1 ? '1 lote' : `${totalBatches} lotes`;

    const summary = this.getBatchSummary(item);
    const batches = summary.sorted.map(entry => ({
      batch: entry.batch,
      location: entry.location,
      locationLabel: entry.locationLabel,
      status: entry.status,
      formattedDate: this.formatBatchDate(entry.batch),
      quantityLabel: this.formatBatchQuantity(entry.batch, entry.locationUnit),
      quantityValue: this.toNumber(entry.batch.quantity),
      unitLabel: this.getUnitLabel(this.normalizeUnitValue(entry.locationUnit)),
      opened: Boolean(entry.batch.opened),
    }));

    const lowStock = this.isLowStock(item);
    const aggregates = this.computeProductAggregates(batches, lowStock);
    const colorClass = this.getColorClass(aggregates.status.state);

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
      formattedEarliestExpirationShort: aggregates.earliestDate
        ? this.formatDateCompact(aggregates.earliestDate)
        : 'Sin fecha',
      formattedEarliestExpirationLong: aggregates.earliestDate
        ? this.formatDateVerbose(aggregates.earliestDate)
        : 'Sin fecha',
      batchCountsLabel: aggregates.batchSummaryLabel,
      batchCounts: aggregates.counts,
      batches,
    };
  }

  formatBatchDate(batch: ItemBatch): string {
    const value = batch.expirationDate;
    if (!value) {
      return 'Sin fecha';
    }
    try {
      return this.formatDateVerbose(value);
    } catch {
      return value;
    }
  }

  formatBatchQuantity(batch: ItemBatch, locationUnit: string | MeasurementUnit | undefined): string {
    const formatted = this.roundDisplayQuantity(this.toNumber(batch.quantity)).toLocaleString('es-ES', {
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(this.normalizeUnitValue(locationUnit));
    return `${formatted} ${unitLabel}`;
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

  private formatDateCompact(value: string): string {
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return parsed.toLocaleDateString('es-ES', ES_DATE_FORMAT_OPTIONS.numeric);
    } catch {
      return value;
    }
  }

  private formatDateVerbose(value: string): string {
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return parsed.toLocaleDateString('es-ES', ES_DATE_FORMAT_OPTIONS.numeric);
    } catch {
      return value;
    }
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
          accentColor: '#DC2626',
          chipColor: '#DC2626',
          chipTextColor: '#F8FAFC',
        };
      case 'near-expiry':
        return {
          state,
          label: 'Por caducar',
          accentColor: '#FACC15',
          chipColor: '#FACC15',
          chipTextColor: '#F8FAFC',
        };
      case 'low-stock':
        return {
          state,
          label: 'Bajo stock',
          accentColor: '#FB923C',
          chipColor: '#FB923C',
          chipTextColor: '#0F172A',
        };
      default:
        return {
          state: 'normal',
          label: 'Stock',
          accentColor: '#16A34A',
          chipColor: '#16A34A',
          chipTextColor: '#F8FAFC',
        };
    }
  }

  private buildBatchSummaryLabel(counts: BatchCountsMeta): string {
    if (!counts.total) {
      return 'Sin lotes registrados';
    }

    const descriptors: string[] = [];
    if (counts.expired) {
      descriptors.push(`${counts.expired} caducado${counts.expired > 1 ? 's' : ''}`);
    }
    if (counts.nearExpiry) {
      descriptors.push(`${counts.nearExpiry} por caducar`);
    }
    if (counts.normal) {
      descriptors.push(`${counts.normal} con stock`);
    }
    if (counts.unknown) {
      descriptors.push(`${counts.unknown} sin fecha`);
    }

    const totalLabel = counts.total === 1 ? '1 lote' : `${counts.total} lotes`;
    return descriptors.length ? `${totalLabel} (${descriptors.join(', ')})` : totalLabel;
  }

  private getBatchSummary(item: PantryItem): BatchSummaryMeta {
    return this.batchSummaries().get(item._id) ?? { total: 0, sorted: [] };
  }

  private collectBatches(item: PantryItem): BatchEntryMeta[] {
    const batches: BatchEntryMeta[] = [];
    for (const location of item.locations) {
      const locationLabel = this.getLocationLabel(location.locationId);
      const locationUnit = this.normalizeUnitValue(location.unit);
      const entries = this.getLocationBatches(location);
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

  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    const now = new Date();
    const nearExpiryThreshold = new Date();
    nearExpiryThreshold.setDate(now.getDate() + this.nearExpiryDays);
    if (!batch.expirationDate) {
      return { label: 'Sin fecha', icon: 'remove-circle-outline', state: 'unknown', color: 'medium' };
    }
    const expiryDate = new Date(batch.expirationDate);
    if (!Number.isFinite(expiryDate.getTime())) {
      return { label: 'Sin fecha', icon: 'remove-circle-outline', state: 'unknown', color: 'medium' };
    }
    if (expiryDate < now) {
      return { label: 'Caducado', icon: 'alert-circle-outline', state: 'expired', color: 'danger' };
    }
    if (expiryDate <= nearExpiryThreshold) {
      return { label: 'Por caducar', icon: 'hourglass-outline', state: 'near-expiry', color: 'warning' };
    }
    return { label: 'Stock', icon: 'checkmark-circle-outline', state: 'normal', color: 'success' };
  }

  /** Return the earliest expiry date present in the provided locations array. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    const dates: string[] = [];
    for (const location of locations) {
      const batches = this.getLocationBatches(location);
      for (const batch of batches) {
        if (batch.expirationDate) {
          dates.push(batch.expirationDate);
        }
      }
    }
    if (!dates.length) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
  }

  getLocationBatches(location: ItemLocationStock): ItemBatch[] {
    return Array.isArray(location.batches) ? location.batches : [];
  }

  getLocationMeta(location: ItemLocationStock): string {
    const batches = this.getLocationBatches(location);
    if (!batches.length) {
      return '';
    }
    const earliest = this.getLocationEarliestExpiry(location);
    if (earliest) {
      return `Caduca: ${this.formatShortDate(earliest)}`;
    }
    const openedCount = batches.filter(batch => batch.opened).length;
    if (openedCount > 0) {
      return openedCount === 1 ? '1 lote abierto' : `${openedCount} lotes abiertos`;
    }
    return 'Sin caducidad registrada';
  }

  getLocationTotal(location: ItemLocationStock): number {
    return this.sumBatchQuantities(location.batches);
  }

  getLocationTotalForControl(index: number): number {
    const batchesArray = this.getBatchesArray(index);
    return batchesArray.controls.reduce((sum, control) => {
      const raw = control.get('quantity')?.value;
      const quantity = Number(raw ?? 0);
      return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);
  }

  getLocationUnitLabelForControl(index: number): string {
    const control = this.locationsArray.at(index).get('unit');
    const value = this.normalizeUnitValue(control?.value as MeasurementUnit | string | undefined);
    return this.getUnitLabel(value);
  }

  private getLocationEarliestExpiry(location: ItemLocationStock): string | undefined {
    const batches = this.getLocationBatches(location);
    const dates = batches
      .map(batch => batch.expirationDate)
      .filter((date): date is string => Boolean(date));
    if (!dates.length) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
  }

  private formatShortDate(value: string): string {
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return parsed.toLocaleDateString('es-ES', ES_DATE_FORMAT_OPTIONS.numeric);
    } catch {
      return value;
    }
  }

  /**
   * Mutate the local signal cache to reflect a quantity change before persistence.
   * Ensures a location entry exists even if the delta introduces a new bucket.
   */
  private applyLocationBatches(itemId: string, locationId: string, batches: ItemBatch[]): PantryItem | null {
    let updatedItem: PantryItem | null = null;
    this.itemsState.update(items =>
      items.map(item => {
        if (item._id !== itemId) {
          return item;
        }

        const unitFallback = this.normalizeUnitValue(
          item.locations.find(loc => loc.locationId === locationId)?.unit ?? this.getPrimaryUnit(item)
        );

        let found = false;
        const nextLocations = item.locations.map(loc => {
          if (loc.locationId === locationId) {
            found = true;
            const normalizedUnit = this.normalizeUnitValue(loc.unit ?? unitFallback);
            return {
              ...loc,
              unit: normalizedUnit,
              batches: this.sanitizeBatches(batches, normalizedUnit),
            };
          }
          return loc;
        });

        if (!found) {
          const normalizedUnit = this.normalizeUnitValue(unitFallback);
          nextLocations.push({
            locationId,
            unit: normalizedUnit,
            batches: this.sanitizeBatches(batches, normalizedUnit),
          });
        }

        const rebuilt = this.rebuildItemWithLocations(item, nextLocations);
        updatedItem = rebuilt;
        return rebuilt;
      })
    );

    return updatedItem;
  }

  /**
   * Merge pending optimistic updates over the latest store snapshot so the UI
   * does not briefly revert to stale quantities while debounced saves run.
   */
  private mergePendingItems(source: PantryItem[]): PantryItem[] {
    if (!this.pendingItems.size) {
      return source;
    }

    const merged = source.map(item => this.pendingItems.get(item._id) ?? item);
    const seen = new Set(merged.map(item => item._id));

    for (const [pendingId, pendingItem] of this.pendingItems.entries()) {
      if (!seen.has(pendingId)) {
        merged.push(pendingItem);
      }
    }

    return merged;
  }

  private sanitizeBatches(batches: ItemBatch[] | undefined, unit: MeasurementUnit | string): ItemBatch[] {
    if (!Array.isArray(batches) || !batches.length) {
      return [];
    }
    const normalizedUnit = this.normalizeUnitValue(unit);
    const normalized = batches.map(batch => ({
      ...batch,
      batchId: batch.batchId ?? this.createTempBatchId(),
      quantity: this.toNumber(batch.quantity),
      unit: this.normalizeUnitValue(batch.unit ?? normalizedUnit),
      opened: batch.opened ?? false,
    }));

    return this.mergeBatchesByExpiry(normalized);
  }

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
        seen.set(key, batch);
        merged.push(batch);
        continue;
      }

      existing.quantity = this.toNumber(existing.quantity) + this.toNumber(batch.quantity);
      existing.opened = Boolean(existing.opened || batch.opened);
    }

    return merged;
  }

  private sumBatchQuantities(batches: ItemBatch[] | undefined): number {
    if (!Array.isArray(batches) || !batches.length) {
      return 0;
    }
    const total = batches.reduce((sum, batch) => sum + this.toNumber(batch.quantity), 0);
    return this.roundDisplayQuantity(total);
  }

  private toNumber(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  private createTempBatchId(): string {
    return `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private updateLocationTotals(locations: ItemLocationStock[]): ItemLocationStock[] {
    return locations.map(location => {
      const unit = this.normalizeUnitValue(location.unit);
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
      expirationDate: this.computeEarliestExpiry(normalizedLocations),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Debounce stock writes so rapid tap interactions batch into fewer saves. */
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
          await this.pantryStore.updateItem(pending);
          const message = this.buildStockUpdateMessage(pending);
          if (message) {
            await this.presentToast(message, 'success');
          }
        } catch (err) {
          console.error('[PantryListComponent] updateItem error', err);
          await this.presentToast('Error updating quantity', 'danger');
        } finally {
          this.pendingItems.delete(itemId);
        }
      }
      this.stockSaveTimers.delete(itemId);
    }, this.stockSaveDelay);

    this.stockSaveTimers.set(itemId, timer);
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

  private async presentToast(message: string, color: string = 'medium'): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 1600,
      position: 'bottom',
    });
    await toast.present();
  }

  ngOnDestroy(): void {
    this.clearStockSaveTimers();
  }

  private clearStockSaveTimers(): void {
    for (const timer of this.stockSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.stockSaveTimers.clear();
    this.pendingItems.clear();
  }

  /** Craft a toast message summarizing a newly created item. */
  private buildCreateSuccessMessage(item: PantryItem): string {
    const name = item.name?.trim() || 'Producto';
    const quantityText = this.formatQuantityForMessage(
      this.getTotalQuantity(item),
      this.getPrimaryUnit(item)
    );
    const breakdown = this.formatLocationBreakdown(item.locations);
    const quantitySegment = quantityText ? ` (${quantityText})` : '';
    const breakdownSegment = breakdown ? ` · ${breakdown}` : '';
    return `✅ ${name} añadido${quantitySegment}${breakdownSegment}.`;
  }

  /** Explain what changed during an update so users understand the persisted action. */
  private buildUpdateSuccessMessage(previous: PantryItem, updated: PantryItem): string {
    const previousBreakdown = this.formatLocationBreakdown(previous.locations);
    const nextBreakdown = this.formatLocationBreakdown(updated.locations);
    if (previousBreakdown !== nextBreakdown) {
      return `📦 Ubicaciones actualizadas: ${nextBreakdown || 'sin asignar'}.`;
    }

    const previousQuantity = this.getTotalQuantity(previous);
    const nextQuantity = this.getTotalQuantity(updated);
    if (previousQuantity !== nextQuantity) {
      const quantityText = this.formatQuantityForMessage(nextQuantity, this.getPrimaryUnit(updated));
      if (quantityText) {
        return `💾 Stock actualizado: ${updated.name} (${quantityText}).`;
      }
      return '💾 Stock actualizado.';
    }

    return '💾 Cambios guardados.';
  }

  /** Produce a brief toast summarizing the current stock state. */
  private buildStockUpdateMessage(item: PantryItem): string {
    const quantityText = this.formatQuantityForMessage(
      this.getTotalQuantity(item),
      this.getPrimaryUnit(item)
    );
    if (quantityText) {
      return `💾 Stock actualizado: ${item.name} (${quantityText}).`;
    }
    return '💾 Stock actualizado.';
  }

  /** Human readable breakdown describing cómo se reparte el stock. */
  formatLocationBreakdown(locations: ItemLocationStock[]): string {
    if (!locations.length) {
      return '';
    }
    return locations
      .map(location => {
        const quantity = this.roundDisplayQuantity(this.getLocationTotal(location));
        const unitLabel = this.getUnitLabel(this.normalizeUnitValue(location.unit));
        const label = getLocationDisplayName(location.locationId, 'Sin ubicación');
        const batches = this.getLocationBatches(location);
        const extras: string[] = [];
        if (batches.length) {
          const batchesLabel = batches.length === 1 ? '1 lote' : `${batches.length} lotes`;
          extras.push(batchesLabel);
          const earliest = this.getLocationEarliestExpiry(location);
          if (earliest) {
            extras.push(`cad ${this.formatShortDate(earliest)}`);
          }
        }
        const meta = extras.length ? ` (${extras.join(' · ')})` : '';
        return `${quantity} ${unitLabel} · ${label}${meta}`;
      })
      .join(', ');
  }

  private formatQuantityForMessage(quantity?: number | null, unit?: MeasurementUnit | string | null): string | null {
    if (quantity == null || Number.isNaN(Number(quantity))) {
      return null;
    }
    const formattedNumber = this.roundDisplayQuantity(Number(quantity)).toLocaleString('es-ES', {
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(this.normalizeUnitValue(unit ?? undefined));
    return `${formattedNumber} ${unitLabel}`.trim();
  }

  private roundDisplayQuantity(value: number): number {
    const num = Number.isFinite(value) ? value : 0;
    return Math.round(num * 100) / 100;
  }

  /**
   * Transform the reactive form into a normalized PantryItem ready for persistence,
   * handling type conversion, default location creation, and legacy compatibility.
   */
  private buildItemPayload(existing?: PantryItem): PantryItem {
    const { name, categoryId, isBasic, supermarket, minThreshold } = this.form.value as {
      name?: string;
      categoryId?: string;
      isBasic?: boolean;
      supermarket?: string;
      minThreshold?: number | string | null;
    };
    const identifier = existing?._id ?? createDocumentId('item');
    const now = new Date().toISOString();
    let normalizedMinThreshold: number | undefined;
    if (minThreshold !== null && minThreshold !== undefined && minThreshold !== '') {
      const numericValue = Number(minThreshold);
      normalizedMinThreshold = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined;
    }

    const locations: ItemLocationStock[] = this.locationsArray.controls
      .map(control => {
        const value = control.value as any;
        const rawLocationId = (value?.locationId ?? '').trim();
        if (!rawLocationId) {
          return null;
        }
        const unit = this.normalizeUnitValue(value?.unit as MeasurementUnit | string | undefined);
        const batchesControl = control.get('batches');
        const batches = batchesControl instanceof FormArray
          ? (batchesControl.controls as FormGroup[]).map(group => {
              const batchValue = group.value as any;
              const expirationDate = batchValue?.expirationDate
                ? new Date(batchValue.expirationDate).toISOString()
                : undefined;
              const batchQuantity = batchValue?.quantity != null ? Number(batchValue.quantity) : 0;
              const batchId = (batchValue?.batchId ?? '').trim() || undefined;
              const opened = batchValue?.opened ? true : undefined;
              return {
                batchId,
                quantity: Number.isFinite(batchQuantity) ? batchQuantity : 0,
                expirationDate,
                opened,
                unit,
              } as ItemBatch;
            })
          : [];

        const normalizedBatches = batches.filter(batch =>
          batch.quantity > 0 ||
          Boolean(batch.expirationDate) ||
          Boolean(batch.opened)
        );

        return {
          locationId: rawLocationId,
          unit,
          batches: normalizedBatches,
        } as ItemLocationStock;
      })
      .filter((location): location is ItemLocationStock => location !== null);

    if (!locations.length) {
      throw new Error('LOCATION_REQUIRED');
    }

    const earliestExpiry = this.computeEarliestExpiry(locations);
    const normalizedSupermarket = this.normalizeSupermarketInput(supermarket);
    if (!normalizedSupermarket) {
      throw new Error('SUPERMARKET_REQUIRED');
    }

    const base: PantryItem = {
      _id: identifier,
      _rev: existing?._rev,
      type: 'item',
      householdId: existing?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      name: (name ?? '').trim(),
      categoryId: (categoryId ?? '').trim(),
      locations,
      supermarket: normalizedSupermarket,
      isBasic: isBasic ? true : undefined,
      minThreshold: normalizedMinThreshold,
      expirationDate: earliestExpiry,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return base;
  }

  private normalizeSupermarketInput(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.replace(/\s+/g, ' ');
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

  /** Build category filter metadata including how many items are low within each group. */
  private computeCategoryOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number; lowCount: number }> {
    const counts = new Map<string, { label: string; count: number; lowCount: number }>();
    for (const item of items) {
      const id = (item.categoryId ?? '').trim();
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
      { id: 'all', label: `Todas`, count: items.length, lowCount: lowTotal },
      ...mapped
    ];
  }

  private buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();

    for (const item of items) {
      const key = item.categoryId?.trim() || 'uncategorized';
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

  formatCategoryName(key: string): string {
    return this.formatFriendlyName(key, 'Uncategorized');
  }

  private formatFriendlyName(value: string, fallback: string): string {
    const key = value?.trim();
    if (!key) {
      return fallback;
    }
    const plain = key.replace(/^(category:|location:)/i, '');
    return plain
      .split(/[-_:]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toDateInputValue(dateIso: string): string {
    try {
      return new Date(dateIso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  private syncExpandedItems(source: PantryItem[] = this.itemsState()): void {
    const validIds = new Set(source.map(item => item._id));
    for (const id of Array.from(this.expandedItems)) {
      if (!validIds.has(id)) {
        this.expandedItems.delete(id);
      }
    }
  }

}
