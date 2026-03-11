import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import type {
  BatchEntryMeta,
  BatchStatusMeta,
  BatchSummaryMeta,
  ItemBatch,
  PantryItem,
  PantryItemCardViewModel,
} from '@core/models/pantry';
import { PantryViewModelService } from '../pantry-view-model.service';
import { PantryStoreService } from '../pantry-store.service';
import { toDateInputValue, toIsoDate } from '@core/utils/date.util';
import { generateBatchId } from '@core/utils';
import { formatFriendlyName, normalizeTrim } from '@core/utils/normalization.util';
import { UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { CatalogOptionsService } from '../../settings';

/**
 * Manages batches modal state and batch view models.
 */
@Injectable()
export class PantryBatchesModalStateService {
  private readonly viewModel = inject(PantryViewModelService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly catalogOptions = inject(CatalogOptionsService);

  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);
  readonly editMode = signal(false);
  readonly editedBatches = signal<ItemBatch[]>([]);
  readonly isSaving = signal(false);

  /**
   * Computed batch summaries for all items.
   * Must be provided from parent service via parameter to avoid circular dependency.
   */
  batchSummaries!: Signal<Map<string, BatchSummaryMeta>>;

  /**
   * Location options for batch location selector.
   * Must be provided from parent service.
   */
  locationOptions!: Signal<string[]>;

  // Reference to pantry items state for optimistic updates
  pantryItemsState?: WritableSignal<PantryItem[]>;

  /**
   * Open batches modal for an item.
   */
  openBatchesModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectedBatchesItem.set(item);
    this.showBatchesModal.set(true);
  }

  /**
   * Close batches modal and cleanup state.
   */
  closeBatchesModal(): void {
    if (!this.showBatchesModal()) {
      return;
    }
    this.showBatchesModal.set(false);
    this.selectedBatchesItem.set(null);
    this.editMode.set(false);
    this.editedBatches.set([]);
  }

  /**
   * Dismiss modal without cleanup (for backdrop click).
   */
  dismissBatchesModal(): void {
    this.showBatchesModal.set(false);
    this.editMode.set(false);
    this.editedBatches.set([]);
  }

  /**
   * Enter edit mode.
   */
  enterEditMode(): void {
    const item = this.selectedBatchesItem();
    if (!item) {
      return;
    }
    // Create a deep copy of batches for editing
    this.editedBatches.set(
      (item.batches ?? []).map(batch => ({ ...batch }))
    );
    this.editMode.set(true);
  }

  /**
   * Cancel edit mode and discard changes.
   */
  cancelEditMode(): void {
    this.editMode.set(false);
    this.editedBatches.set([]);
  }

  /**
   * Add a new empty batch, entering edit mode if needed.
   */
  addBatch(): void {
    if (!this.editMode()) {
      this.enterEditMode();
    }
    const newBatch: ItemBatch = {
      batchId: generateBatchId(),
      quantity: 1,
      locationId: UNASSIGNED_LOCATION_KEY,
      expirationDate: undefined,
    };
    this.editedBatches.update(batches => [...batches, newBatch]);
  }

  /**
   * Update quantity for a batch at given index.
   */
  updateBatchQuantity(index: number, quantity: number): void {
    const batches = this.editedBatches();
    if (index < 0 || index >= batches.length) {
      return;
    }
    const updated = [...batches];
    updated[index] = {
      ...updated[index],
      quantity: Math.max(0, quantity),
    };
    this.editedBatches.set(updated);
  }

  /**
   * Update expiration date for a batch at given index.
   */
  updateBatchExpirationDate(index: number, dateString: string): void {
    const batches = this.editedBatches();
    if (index < 0 || index >= batches.length) {
      return;
    }
    const updated = [...batches];
    const isoDate = dateString ? (toIsoDate(dateString) ?? undefined) : undefined;
    updated[index] = {
      ...updated[index],
      expirationDate: isoDate,
    };
    this.editedBatches.set(updated);
  }

  /**
   * Update location for a batch at given index.
   */
  updateBatchLocation(index: number, locationId: string): void {
    const batches = this.editedBatches();
    if (index < 0 || index >= batches.length) {
      return;
    }
    const updated = [...batches];
    updated[index] = {
      ...updated[index],
      locationId,
    };
    this.editedBatches.set(updated);
  }

  /**
   * Build autocomplete options for location selector.
   */
  getLocationAutocompleteOptions(): AutocompleteItem<string>[] {
    const unassigned: AutocompleteItem<string> = {
      id: UNASSIGNED_LOCATION_KEY,
      title: this.translate.instant('pantry.form.locationAdd.unassigned'),
      raw: UNASSIGNED_LOCATION_KEY,
    };
    return [unassigned, ...this.locationOptions().map(loc => ({ id: loc, title: loc, raw: loc }))];
  }

  /**
   * Get display value for a batch's location (for autocomplete input binding).
   */
  getLocationDisplayValue(batch: ItemBatch): string {
    if (!batch.locationId || batch.locationId === UNASSIGNED_LOCATION_KEY) {
      return this.translate.instant('pantry.form.locationAdd.unassigned');
    }
    return batch.locationId;
  }

  /**
   * Handle location selection from entity autocomplete.
   */
  onLocationAutocompleteSelect(index: number, option: AutocompleteItem<string>): void {
    const value = option?.raw;
    if (!value) {
      return;
    }
    this.updateBatchLocation(index, value);
  }

  /**
   * Add a new location from typed text and assign it to the batch.
   */
  addLocationOptionFromText(index: number, value: string): void {
    const nextValue = normalizeTrim(value);
    if (!nextValue) {
      return;
    }
    const formatted = formatFriendlyName(nextValue, nextValue);
    void this.addAndAssignLocation(index, formatted);
  }

  private async addAndAssignLocation(index: number, value: string): Promise<void> {
    const selected = await this.catalogOptions.addLocationOption(value);
    this.updateBatchLocation(index, selected);
  }

  /**
   * Get date input value for a batch (for date input binding).
   */
  getBatchDateInputValue(batch: ItemBatch): string {
    return batch.expirationDate ? toDateInputValue(batch.expirationDate) : '';
  }

  /**
   * Save edited batches.
   */
  async saveBatches(): Promise<void> {
    const item = this.selectedBatchesItem();
    if (!item || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    try {
      // Filter out batches with 0 quantity
      const validBatches = this.editedBatches().filter(batch => (batch.quantity ?? 0) > 0);

      const updatedItem: PantryItem = {
        ...item,
        batches: validBatches,
        updatedAt: new Date().toISOString(),
      };

      // Update optimistic state if available
      if (this.pantryItemsState) {
        this.pantryItemsState.update(items =>
          items.map(existing => (existing._id === updatedItem._id ? updatedItem : existing))
        );
      }

      // Save to store
      await this.pantryStore.updateItem(updatedItem);

      // Update selected item and exit edit mode
      this.selectedBatchesItem.set(updatedItem);
      this.editMode.set(false);
      this.editedBatches.set([]);
    } catch (err) {
      console.error('[PantryBatchesModalStateService] saveBatches error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Get total batch count for an item.
   */
  getTotalBatchCount(item: PantryItem): number {
    return this.getBatchSummary(item).total;
  }

  /**
   * Get sorted batches for an item.
   */
  getSortedBatches(item: PantryItem): BatchEntryMeta[] {
    return this.getBatchSummary(item).sorted;
  }

  /**
   * Build item card view model for display.
   */
  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel {
    const summary = this.getBatchSummary(item);
    return this.viewModel.buildItemCardViewModel({
      item,
      summary,
    });
  }

  /**
   * Format batch expiration date (delegates to view model).
   */
  formatBatchDate(batch: ItemBatch): string {
    return this.viewModel.formatBatchDate(batch);
  }

  /**
   * Format batch quantity (delegates to view model).
   */
  formatBatchQuantity(batch: ItemBatch): string {
    return this.viewModel.formatBatchQuantity(batch);
  }

  /**
   * Get batch status metadata (delegates to view model).
   */
  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    return this.viewModel.getBatchStatus(batch);
  }

  private getBatchSummary(item: PantryItem): BatchSummaryMeta {
    if (!this.batchSummaries) {
      return { total: 0, sorted: [] };
    }
    return this.batchSummaries().get(item._id) ?? { total: 0, sorted: [] };
  }
}
