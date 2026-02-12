import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import type {
  BatchEntryMeta,
  BatchStatusMeta,
  BatchSummaryMeta,
  ItemBatch,
  PantryItem,
  PantryItemCardViewModel,
} from '@core/models/pantry';
import { PantryStoreService } from '../pantry-store.service';
import { PantryViewModelService } from '../pantry-view-model.service';

/**
 * Manages batches modal state and batch view models.
 */
@Injectable()
export class PantryBatchesModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly viewModel = inject(PantryViewModelService);

  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);

  /**
   * Computed batch summaries for all items.
   * Must be provided from parent service via parameter to avoid circular dependency.
   */
  batchSummaries!: Signal<Map<string, BatchSummaryMeta>>;

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
  }

  /**
   * Dismiss modal without cleanup (for backdrop click).
   */
  dismissBatchesModal(): void {
    this.showBatchesModal.set(false);
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
    const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
    const summary = this.getBatchSummary(item);
    return this.viewModel.buildItemCardViewModel({
      item,
      summary,
      totalQuantity,
      totalBatches: summary.total,
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
