import { Injectable, WritableSignal, inject } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { BATCH_STOCK_SAVE_DELAY_MS, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { computeEarliestExpiry, normalizeBatches, sumQuantities } from '@core/domain/pantry';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { roundQuantity, toNumberOrZero } from '@core/utils/formatting.util';
import { normalizeLocationId, normalizeLowercase } from '@core/utils/normalization.util';
import { generateBatchId } from '@core/utils';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { PantryStoreService } from './pantry-store.service';
import { PantryViewModelService } from './pantry-view-model.service';

/**
 * Manages batch quantity adjustments, debounced saves, and optimistic updates.
 */
@Injectable()
export class PantryBatchOperationsService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly viewModel = inject(PantryViewModelService);
  private readonly eventManager = inject(HistoryEventManagerService);

  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingEventMeta = new Map<string, {
    batchId?: string;
    adjustmentType?: 'add' | 'consume';
    deltaQuantity?: number;
  }>();
  private readonly stockSaveDelay = BATCH_STOCK_SAVE_DELAY_MS;

  /**
   * Adjust batch quantity with debounced save and optimistic update.
   */
  async adjustBatchQuantity(
    item: PantryItem,
    locationId: string,
    batch: ItemBatch,
    delta: number,
    event?: Event,
    pantryItemsState?: WritableSignal<PantryItem[]>
  ): Promise<void> {
    event?.stopPropagation();
    if (!item?._id || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    const normalizedLocation = normalizeLocationId(locationId, UNASSIGNED_LOCATION_KEY);
    const originalTotal = this.getLocationTotal(item, normalizedLocation);
    const sanitizedBatches = normalizeBatches(item.batches ?? [], { generateBatchId }).map(entry => ({
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

    const updatedItem = this.rebuildItemWithBatches(item, sanitizedBatches, pantryItemsState);
    const nextTotal = this.getLocationTotal(updatedItem, normalizedLocation);
    await this.provideQuantityFeedback(originalTotal, nextTotal);
    this.triggerStockSave(item._id, updatedItem, {
      batchId: targetBatchId,
      adjustmentType: delta > 0 ? 'add' : 'consume',
      deltaQuantity: delta,
    });
  }

  /**
   * Cancel pending stock save for an item.
   */
  cancelPendingStockSave(itemId: string): void {
    this.cancelPendingStockSaveInternal(itemId);
  }

  /**
   * Clear all pending saves and timers. Called on service destroy.
   */
  clearAll(): void {
    this.clearStockSaveTimers();
  }

  /**
   * Merge pending optimistic updates into the item list for display.
   */
  mergePendingItems(source: PantryItem[]): PantryItem[] {
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

  /**
   * Get total quantity for an item (delegates to store).
   */
  getTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  /**
   * Check if item has any opened batch (delegates to store).
   */
  hasOpenBatch(item: PantryItem): boolean {
    return this.pantryStore.hasItemOpenBatch(item);
  }

  /**
   * Get location display label (delegates to view model).
   */
  getLocationLabel(locationId: string | undefined): string {
    return this.viewModel.getLocationLabel(locationId);
  }

  private rebuildItemWithBatches(
    item: PantryItem,
    batches: ItemBatch[],
    pantryItemsState?: WritableSignal<PantryItem[]>
  ): PantryItem {
    const normalized = normalizeBatches(batches, { generateBatchId }).map(batch => ({
      ...batch,
      locationId: normalizeLocationId(batch.locationId, UNASSIGNED_LOCATION_KEY),
    }));

    const rebuilt = {
      ...item,
      batches: normalized,
      expirationDate: computeEarliestExpiry(normalized),
      updatedAt: new Date().toISOString(),
    };

    // Update signal if provided (for optimistic UI)
    if (pantryItemsState) {
      pantryItemsState.update(items =>
        items.map(existing => (existing._id === rebuilt._id ? rebuilt : existing))
      );
    }

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
          console.error('[PantryBatchOperationsService] updateItem error', err);
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
    const normalized = normalizeLowercase(locationId);
    const batches = (item.batches ?? []).filter(
      batch => normalizeLowercase(batch.locationId ?? UNASSIGNED_LOCATION_KEY) === normalized
    );
    return sumQuantities(batches, { round: roundQuantity });
  }
}
