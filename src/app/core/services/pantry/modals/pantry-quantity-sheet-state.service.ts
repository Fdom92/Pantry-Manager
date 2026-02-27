import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { PantryBatchOperationsService } from '../pantry-batch-operations.service';

/**
 * Manages quantity adjustment sheet state and FIFO logic.
 */
@Injectable()
export class PantryQuantitySheetStateService {
  private readonly batchOps = inject(PantryBatchOperationsService);

  readonly showQuantitySheet = signal(false);
  readonly selectedItem = signal<PantryItem | null>(null);
  readonly pendingQuantityChange = signal(0);

  // Reference to pantry items state for optimistic updates
  pantryItemsState?: WritableSignal<PantryItem[]>;

  /**
   * Open quantity sheet for an item.
   */
  openQuantitySheet(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectedItem.set(item);
    this.pendingQuantityChange.set(0);
    this.showQuantitySheet.set(true);
  }

  /**
   * Close the sheet. Pending changes are applied via didDismiss → dismissQuantitySheet().
   */
  closeQuantitySheet(): void {
    this.showQuantitySheet.set(false);
  }

  /**
   * Apply pending changes (if any) and reset sheet state.
   * Single save point for all dismiss paths: close button, swipe, backdrop, navigation.
   * State is reset before the async save so double-calls are safe no-ops.
   */
  async dismissQuantitySheet(): Promise<void> {
    const item = this.selectedItem();
    const change = this.pendingQuantityChange();

    this.showQuantitySheet.set(false);
    this.selectedItem.set(null);
    this.pendingQuantityChange.set(0);

    if (item && change !== 0) {
      await this.applyPendingChanges(item, change);
    }
  }

  /**
   * Increment pending quantity change (doesn't modify batches yet).
   */
  incrementQuantity(item: PantryItem): void {
    if (!item?._id) {
      return;
    }
    this.pendingQuantityChange.update(current => current + 1);
  }

  /**
   * Decrement pending quantity change (doesn't modify batches yet).
   */
  decrementQuantity(item: PantryItem): void {
    if (!item?._id) {
      return;
    }

    const currentTotal = this.getTotalQuantity(item);
    const pendingChange = this.pendingQuantityChange();

    // Don't allow going below 0
    if (currentTotal + pendingChange <= 0) {
      return;
    }

    this.pendingQuantityChange.update(current => current - 1);
  }

  /**
   * Apply accumulated quantity changes when closing the sheet.
   */
  private async applyPendingChanges(item: PantryItem, change: number): Promise<void> {
    await this.batchOps.adjustTotalQuantityWithFIFO(item, change, this.pantryItemsState);
  }


  /**
   * Get total quantity for an item.
   */
  getTotalQuantity(item: PantryItem): number {
    return this.batchOps.getTotalQuantity(item);
  }
}
