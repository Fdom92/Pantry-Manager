import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ReviewPromptService } from '../../shared/review-prompt.service';
import { ToastService } from '../../shared';
import { PantryBatchOperationsService } from '../pantry-batch-operations.service';

/**
 * Manages quantity adjustment sheet state and FIFO logic.
 */
@Injectable()
export class PantryQuantitySheetStateService {
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);

  readonly showQuantitySheet = signal(false);
  readonly selectedItem = signal<PantryItem | null>(null);
  readonly pendingQuantityChange = signal(0);
  readonly pendingExpiryDate = signal<string | undefined>(undefined);
  readonly pendingNoExpiry = signal(false);

  // Reference to pantry items state for optimistic updates
  pantryItemsState?: WritableSignal<PantryItem[]>;

  /**
   * Open quantity sheet for an item.
   */
  open(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    // The denominator for pantry_quantity_adjusted, which until 5.4 only fired
    // when something actually changed — a sheet opened and closed untouched
    // left no trace at all, on the one path people really consume through.
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_QUANTITY_SHEET_OPENED, {
      kind: item.productType === 'fresh' ? 'fresh' : 'despensa',
      quantity: this.getTotalQuantity(item),
    });
    this.selectedItem.set(item);
    this.pendingQuantityChange.set(0);
    this.pendingExpiryDate.set(undefined);
    this.pendingNoExpiry.set(false);
    this.showQuantitySheet.set(true);
  }

  /**
   * Close the sheet. Pending changes are applied via didDismiss → dismissQuantitySheet().
   */
  close(): void {
    this.showQuantitySheet.set(false);
  }

  /**
   * Apply pending changes (if any) and reset sheet state.
   * Single save point for all dismiss paths: close button, swipe, backdrop, navigation.
   * State is reset before the async save so double-calls are safe no-ops.
   */
  async dismiss(): Promise<void> {
    const item = this.selectedItem();
    const change = this.pendingQuantityChange();
    const expiryDate = this.pendingExpiryDate();

    const noExpiry = this.pendingNoExpiry();
    this.showQuantitySheet.set(false);
    this.selectedItem.set(null);
    this.pendingQuantityChange.set(0);
    this.pendingExpiryDate.set(undefined);
    this.pendingNoExpiry.set(false);

    if (item && change !== 0) {
      const previousTotal = this.getTotalQuantity(item);
      await this.applyPendingChanges(item, change, expiryDate, noExpiry);
      this.analytics.track(ANALYTICS_EVENTS.PANTRY_QUANTITY_ADJUSTED, {
        kind: item.productType === 'fresh' ? 'fresh' : 'despensa',
        delta: change,
        direction: change > 0 ? 'increment' : 'decrement',
      });
      if (change < 0) {
        this.reviewPrompt.handleConsumeCompleted();
        const newTotal = previousTotal + change;
        if (newTotal <= 0 && item.isBasic) {
          this.toast.success('pantry.toasts.addedToList');
        } else if (newTotal <= 0) {
          this.toast.info('pantry.toasts.hiddenUntilStock');
        }
      }
    }
  }

  /**
   * Set the optional expiry date for the new batch being incremented.
   * Clears noExpiry when a real date is set.
   */
  setExpiryDate(date: string | undefined): void {
    this.pendingExpiryDate.set(date || undefined);
    if (date) {
      this.pendingNoExpiry.set(false);
    }
  }

  /**
   * Toggle "intentionally no expiry" for the new batch. Clears pending date.
   */
  toggleNoExpiry(): void {
    const next = !this.pendingNoExpiry();
    this.pendingNoExpiry.set(next);
    if (next) {
      this.pendingExpiryDate.set(undefined);
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
   * Set pending change so the item's total lands at exactly 0 in one tap,
   * instead of one "-" tap per remaining unit.
   */
  emptyOut(item: PantryItem): void {
    if (!item?._id) {
      return;
    }
    const remaining = this.getTotalQuantity(item) + this.pendingQuantityChange();
    if (remaining <= 0) {
      return;
    }
    this.pendingQuantityChange.update(current => current - remaining);
  }

  /**
   * Apply accumulated quantity changes when closing the sheet.
   */
  private async applyPendingChanges(item: PantryItem, change: number, expiryDate?: string, noExpiry?: boolean): Promise<void> {
    await this.batchOps.adjustTotalQuantityWithFIFO(item, change, this.pantryItemsState, expiryDate, 'quantity_sheet', noExpiry);
  }


  /**
   * Get total quantity for an item.
   */
  getTotalQuantity(item: PantryItem): number {
    return this.batchOps.getTotalQuantity(item);
  }
}
