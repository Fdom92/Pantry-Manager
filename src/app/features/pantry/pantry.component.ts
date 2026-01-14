import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID, DEFAULT_LOCATION_OPTIONS } from '@core/constants';
import {
  computeEarliestExpiry as computeEarliestExpiryStock,
  sumQuantities as sumQuantitiesStock
} from '@core/domain/pantry-stock';
import {
  BatchEntryMeta,
  BatchStatusMeta,
  FilterChipViewModel,
  ItemBatch,
  ItemLocationStock,
  PantryGroup,
  PantryItem,
  PantryItemCardViewModel
} from '@core/models/inventory';
import { MeasurementUnit } from '@core/models/shared';
import {
  LanguageService,
  PantryStoreService,
} from '@core/services';
import { PantryService } from '@core/services/pantry.service';
import { createDocumentId } from '@core/utils';
import { formatShortDate, roundQuantity } from '@core/utils/formatting.util';
import {
  normalizeLocationId,
  normalizeUnitValue
} from '@core/utils/normalization.util';
import { ToastController } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PantryBatchesModalComponent } from './components/batches-modal/batches-modal.component';
import { PantryEditItemModalComponent } from './components/edit-item-modal/edit-item-modal.component';
import { PantryFiltersModalComponent } from './components/filters-modal/filters-modal.component';
import { PantryMoveModalComponent } from './components/move-modal/move-modal.component';
import { PantryDetailComponent } from './components/pantry-detail/pantry-detail.component';
import { PantryStateService } from './pantry.state.service';

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonModal,
    IonTextarea,
    IonFab,
    IonFabButton,
    IonFabList,
    IonSpinner,
    IonChip,
    IonSkeletonText,
    IonText,
    IonFooter,
    CommonModule,
    ReactiveFormsModule,
    PantryDetailComponent,
    TranslateModule,
    EmptyStateComponent,
    PantryBatchesModalComponent,
    PantryMoveModalComponent,
    PantryFiltersModalComponent,
    PantryEditItemModalComponent,
  ],
  templateUrl: './pantry.component.html',
  styleUrls: ['./pantry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryStateService],
})
export class PantryComponent implements OnDestroy {
  @ViewChild('content', { static: false }) private content?: IonContent;
  @ViewChild(PantryEditItemModalComponent, { static: false }) private editItemModal?: PantryEditItemModalComponent;
  // DI
  private readonly state = inject(PantryStateService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly fb = inject(FormBuilder);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  // Data
  readonly moveError = this.state.moveError;
  fastAddModalOpen = false;
  isFastAdding = false;
  private realtimeSubscribed = false;
  readonly loading = this.state.loading;
  readonly nearExpiryDays = this.state.nearExpiryDays;
  readonly MeasurementUnit = this.state.MeasurementUnit;
  readonly skeletonPlaceholders = this.state.skeletonPlaceholders;
  private readonly expandedItems = new Set<string>();
  private readonly deleteAnimationDuration = 220;
  // Signals
  readonly searchTerm = this.state.searchTerm;
  readonly activeFilters = this.state.activeFilters;
  readonly selectedCategory = this.state.selectedCategory;
  readonly selectedLocation = this.state.selectedLocation;
  readonly sortOption = this.state.sortOption;
  readonly statusFilter = this.state.statusFilter;
  readonly moveSubmitting = this.state.moveSubmitting;
  readonly showFilters = this.state.showFilters;
  readonly basicOnly = this.state.basicOnly;
  readonly pantryItemsState = this.state.pantryItemsState;
  readonly showBatchesModal = this.state.showBatchesModal;
  readonly selectedBatchesItem = this.state.selectedBatchesItem;
  readonly showMoveModal = this.state.showMoveModal;
  readonly moveItemTarget = this.state.moveItemTarget;
  readonly hasCompletedInitialLoad = this.state.hasCompletedInitialLoad;
  readonly collapsedGroups = signal<Set<string>>(new Set());
  readonly deletingItems = signal<Set<string>>(new Set());
  // Computed Signals
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
  // Forms
  readonly fastAddForm = this.fb.group({
    entries: this.fb.control('', { nonNullable: true }),
  });

  constructor() {
    // Expansion toggles depend on ids that might disappear when new batches arrive.
    effect(() => {
      this.syncExpandedItems(this.pantryItemsState());
    });

    effect(() => {
      this.syncCollapsedGroups(this.groups());
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
    await this.state.loadItems();
    this.scrollViewportToTop();
  }

  openAdvancedAddModal(): void {
    this.editItemModal?.openCreate();
  }

  openFastAddModal(): void {
    this.fastAddForm.reset({ entries: '' });
    this.fastAddModalOpen = true;
  }

  closeFastAddModal(): void {
    this.fastAddModalOpen = false;
    this.isFastAdding = false;
    this.fastAddForm.reset({ entries: '' });
  }

  hasFastAddEntries(): boolean {
    const value = this.fastAddForm.get('entries')?.value ?? '';
    return value.trim().length > 0;
  }

  openEditItemModal(item: PantryItem, event?: Event): void {
    this.editItemModal?.openEdit(item, event);
  }

  async submitFastAdd(): Promise<void> {
    if (this.isFastAdding) {
      return;
    }
    const rawEntries = this.fastAddForm.get('entries')?.value ?? '';
    const entries = this.parseFastAddEntries(rawEntries);
    if (!entries.length) {
      return;
    }

    this.isFastAdding = true;
    try {
      let created = 0;
      for (const entry of entries) {
        const item = this.buildFastAddItemPayload(entry.name, entry.quantity);
        await this.pantryStore.addItem(item);
        created += 1;
      }
      const messageKey = created === 1 ? 'pantry.fastAdd.singleSuccess' : 'pantry.fastAdd.success';
      this.closeFastAddModal();
      await this.presentToast(this.translate.instant(messageKey, { count: created }), 'success');
    } catch (err) {
      console.error('[PantryListComponent] submitFastAdd error', err);
      this.isFastAdding = false;
      await this.presentToast(this.translate.instant('pantry.fastAdd.error'), 'danger');
    }
  }

  async deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }
    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';
    if (shouldConfirm) {
      const confirmed = window.confirm(
        this.translate.instant('pantry.confirmDelete', { name: item.name ?? '' })
      );
      if (!confirmed) {
        return;
      }
    }

    this.state.cancelPendingStockSave(item._id);
    this.markItemDeleting(item._id);
    try {
      await this.delay(this.deleteAnimationDuration);
      await this.pantryStore.deleteItem(item._id);
      this.expandedItems.delete(item._id);
      await this.presentToast(this.translate.instant('pantry.toasts.deleted'), 'medium');
    } catch (err) {
      console.error('[PantryListComponent] deleteItem error', err);
      await this.presentToast(this.translate.instant('pantry.toasts.saveError'), 'danger');
    } finally {
      this.unmarkItemDeleting(item._id);
    }
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
    await this.state.adjustBatchQuantity(item, location, batch, delta, event);
  }

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
    this.scrollViewportToTop();
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
    return normalizeUnitValue(this.pantryStore.getItemPrimaryUnit(item));
  }

  getUnitLabelForItem(item: PantryItem): string {
    return this.pantryStore.getUnitLabel(this.getPrimaryUnit(item));
  }

  getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getLocationLabel(locationId: string | undefined): string {
    return normalizeLocationId(locationId, this.translate.instant('common.locations.none'));
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

  isDeleting(item: PantryItem): boolean {
    return this.deletingItems().has(item._id);
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

  /** Scroll to the top of the list after reloading or clearing filters. */
  private scrollViewportToTop(): void {
    this.content?.scrollToTop(300);
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

  getMoveSourceOptions(item: PantryItem | null): Array<{ value: string; label: string; quantityLabel: string }> {
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

  getTotalBatchCount(item: PantryItem): number {
    return this.state.getTotalBatchCount(item);
  }

  hasMultipleBatches(item: PantryItem): boolean {
    return this.getTotalBatchCount(item) > 1;
  }

  getTopBatches(item: PantryItem, limit: number = 3): BatchEntryMeta[] {
    return this.state.getSortedBatches(item).slice(0, limit);
  }

  getSortedBatches(item: PantryItem): BatchEntryMeta[] {
    return this.state.getSortedBatches(item);
  }

  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel {
    return this.state.buildItemCardViewModel(item);
  }

  formatBatchDate(batch: ItemBatch): string {
    return this.state.formatBatchDate(batch);
  }

  formatBatchQuantity(batch: ItemBatch, locationUnit: string | MeasurementUnit | undefined): string {
    return this.state.formatBatchQuantity(batch, locationUnit);
  }

  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    return this.state.getBatchStatus(batch);
  }

  /** Return the earliest expiry date present in the provided locations array. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    return computeEarliestExpiryStock(locations);
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
      return this.translate.instant('pantry.detail.locationMeta.expires', {
        date: formatShortDate(earliest, this.languageService.getCurrentLocale(), { fallback: earliest }),
      });
    }
    const openedCount = batches.filter(batch => batch.opened).length;
    if (openedCount > 0) {
      return openedCount === 1
        ? this.translate.instant('pantry.detail.locationMeta.openedOne')
        : this.translate.instant('pantry.detail.locationMeta.openedMany', { count: openedCount });
    }
    return this.translate.instant('pantry.detail.locationMeta.noExpiry');
  }

  getLocationTotal(location: ItemLocationStock): number {
    return sumQuantitiesStock(location.batches, { round: roundQuantity });
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

  ngOnDestroy(): void {
    this.state.onDestroy();
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

  /** Build the simplified payload used by the Fast Add flow. */
  private buildFastAddItemPayload(name: string, quantity: number): PantryItem {
    const now = new Date().toISOString();
    const normalizedName = name.trim() || 'Product';
    const sanitizedQuantity = this.normalizeFastAddQuantity(quantity);
    const roundedQuantity = roundQuantity(Math.max(1, sanitizedQuantity));
    const defaultLocation = this.getDefaultLocationId();
    const batch: ItemBatch = {
      quantity: roundedQuantity,
      unit: MeasurementUnit.UNIT,
    };
    const locations: ItemLocationStock[] = [
      {
        locationId: defaultLocation,
        unit: MeasurementUnit.UNIT,
        batches: [batch],
      }
    ];

    return {
      _id: createDocumentId('item'),
      type: 'item',
      householdId: DEFAULT_HOUSEHOLD_ID,
      name: normalizedName,
      categoryId: '',
      locations,
      supermarket: '',
      isBasic: undefined,
      minThreshold: undefined,
      expirationDate: this.computeEarliestExpiry(locations),
      createdAt: now,
      updatedAt: now,
    };
  }

  private parseFastAddEntries(raw: string): Array<{ name: string; quantity: number }> {
    return raw
      .split(/\r?\n/)
      .map(line => this.parseFastAddLine(line))
      .filter((entry): entry is { name: string; quantity: number } => entry !== null);
  }

  private parseFastAddLine(line: string): { name: string; quantity: number } | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const leadingMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)(?:\s*[x×])?\s+(.+)$/i);
    if (leadingMatch) {
      return {
        name: leadingMatch[2].trim() || trimmed,
        quantity: this.normalizeFastAddQuantity(leadingMatch[1]),
      };
    }

    const trailingMultiplierMatch = trimmed.match(/^(.+?)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)$/i);
    if (trailingMultiplierMatch) {
      return {
        name: trailingMultiplierMatch[1].trim() || trimmed,
        quantity: this.normalizeFastAddQuantity(trailingMultiplierMatch[2]),
      };
    }

    const trailingNumberMatch = trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
    if (trailingNumberMatch) {
      return {
        name: trailingNumberMatch[1].trim() || trimmed,
        quantity: this.normalizeFastAddQuantity(trailingNumberMatch[2]),
      };
    }

    return {
      name: trimmed,
      quantity: 1,
    };
  }

  private normalizeFastAddQuantity(value: string | number | undefined): number {
    if (typeof value === 'number') {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      const numericValue = Number(normalized);
      return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
    }
    return 1;
  }

  formatCategoryName(key: string): string {
    return this.formatFriendlyName(key, this.translate.instant('pantry.form.uncategorized'));
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

  private getDefaultLocationId(): string {
    const presets = this.presetLocationOptions();
    const first = presets[0]?.trim();
    if (first) {
      return first;
    }
    const fallback = DEFAULT_LOCATION_OPTIONS[0];
    return fallback ? fallback.trim() : 'unassigned';
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

}
