import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { ANALYTICS_EVENTS } from '@core/constants';
import {
  dueBatchIndex, findFreezerLocation, findFridgeLocation, freezeOne, moveOne, needsFridgeWhenOpen, openOne, thawOne,
} from '@core/domain/pantry';
import type { ItemBatch } from '@core/models/pantry';
import { generateBatchId } from '@core/utils';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { SettingsPreferencesService } from '../../settings';
import { DateDisplayService } from '../../shared/date-display.service';
import { PantryStoreService } from '../pantry-store.service';
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
  private readonly pantryStore = inject(PantryStoreService);
  private readonly preferences = inject(SettingsPreferencesService);
  private readonly history = inject(HistoryEventManagerService);
  private readonly dates = inject(DateDisplayService);

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


  // ─── One-tap actions: act on one unit of the lot that is due, at once ───
  // Moving, opening and freezing are not consuming: stock only drops on use or discard.

  locations(): string[] {
    return this.preferences.preferences().locationOptions ?? [];
  }

  async openOne(item: PantryItem): Promise<void> {
    const fridge = needsFridgeWhenOpen(item.foodType) ? findFridgeLocation(this.locations()) : undefined;
    await this.applyBatchAction(item, 'open', current =>
      openOne(current.batches ?? [], current.foodType, new Date(), generateBatchId, fridge),
      batch => batch.expirationDate
        ? { key: 'pantry.quickActions.toast.openedUntil', params: { when: this.dates.expiry(batch.expirationDate) } }
        : { key: 'pantry.quickActions.toast.opened' });
  }

  async moveOne(item: PantryItem, locationId: string): Promise<void> {
    await this.applyBatchAction(item, 'move', current => moveOne(current.batches ?? [], locationId, generateBatchId),
      () => ({ key: 'pantry.quickActions.toast.moved', params: { place: locationId } }));
  }

  async freezeOne(item: PantryItem): Promise<void> {
    const freezer = findFreezerLocation(this.locations());
    await this.applyBatchAction(item, 'freeze', current => freezeOne(current.batches ?? [], new Date(), generateBatchId, freezer),
      () => ({ key: 'pantry.quickActions.toast.frozen' }));
  }

  async thawOne(item: PantryItem): Promise<void> {
    await this.applyBatchAction(item, 'thaw', current => thawOne(current.batches ?? [], new Date(), generateBatchId, findFridgeLocation(this.locations())),
      batch => batch.expirationDate
        ? { key: 'pantry.quickActions.toast.thawedUntil', params: { when: this.dates.expiry(batch.expirationDate) } }
        : { key: 'pantry.quickActions.toast.thawed' });
  }

  /** "Se tiró": one unit of the due lot leaves stock and counts as waste. */
  async discardOne(item: PantryItem): Promise<void> {
    const current = await this.closeAndReload(item);
    const batches = current.batches ?? [];
    const index = dueBatchIndex(batches, () => true);
    if (index === -1) return;
    const next = batches.map(b => ({ ...b }));
    next[index].quantity = toNumberOrZero(next[index].quantity) - 1;
    const saved = next.filter(b => toNumberOrZero(b.quantity) > 0);
    // Waste is only recorded once the stock really dropped.
    if (!(await this.pantryStore.updateItem({ ...current, batches: saved }))) {
      this.toast.error('pantry.quickActions.toast.failed');
      return;
    }
    const event = await this.history.logDiscard(current, 1);
    this.trackQuickAction(current, 'discard');
    this.toast.withAction('pantry.quickActions.toast.discarded', 'common.actions.undo', () => {
      void this.undo(current, saved).then(done => { if (done && event) void this.history.undoDiscard(event); });
    });
  }

  /** Saves pending −/+ first, so an action always starts from the stored item. */
  private async closeAndReload(item: PantryItem): Promise<PantryItem> {
    await this.dismiss();
    await this.batchOps.flushPendingStockSave(item._id);
    return this.pantryStore.items().find(i => i._id === item._id) ?? item;
  }

  /**
   * Puts the item back as it was before an action, unless it changed since: an
   * Undo tapped after another edit must not wipe that edit.
   */
  private async undo(before: PantryItem, after: ItemBatch[]): Promise<boolean> {
    const stored = this.pantryStore.items().find(i => i._id === before._id);
    if (!stored || JSON.stringify(stored.batches ?? []) !== JSON.stringify(after)) {
      this.toast.error('pantry.quickActions.toast.undoStale');
      return false;
    }
    return this.pantryStore.updateItem({ ...before, updatedAt: new Date().toISOString() });
  }

  private async applyBatchAction(
    item: PantryItem,
    action: 'open' | 'move' | 'freeze' | 'thaw',
    change: (current: PantryItem) => { batches: ItemBatch[]; index: number } | null,
    message: (changed: ItemBatch) => { key: string; params?: Record<string, unknown> },
  ): Promise<void> {
    const current = await this.closeAndReload(item);
    const result = change(current);
    if (!result) return;
    if (!(await this.pantryStore.updateItem({ ...current, batches: result.batches }))) {
      this.toast.error('pantry.quickActions.toast.failed');
      return;
    }
    this.trackQuickAction(current, action, action === 'move' ? result.batches[result.index].locationId : undefined);
    const { key, params } = message(result.batches[result.index]);
    this.toast.withAction(key, 'common.actions.undo', () => void this.undo(current, result.batches), params);
  }

  private trackQuickAction(item: PantryItem, action: string, to?: string): void {
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_QUICK_ACTION, {
      action,
      product_type: item.productType === 'fresh' ? 'fresh' : 'pantry',
      ...(to ? { to_fridge: to === findFridgeLocation(this.locations()) } : {}),
    });
  }

  /**
   * Get total quantity for an item.
   */
  getTotalQuantity(item: PantryItem): number {
    return this.batchOps.getTotalQuantity(item);
  }
}
