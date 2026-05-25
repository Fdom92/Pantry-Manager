import { Injectable, inject } from '@angular/core';
import { classifyExpiry, sumQuantities } from '@core/domain/pantry';
import { buildExpireBatchKey } from '@core/domain/events';
import type { PantryItem } from '@core/models/pantry';
import type { EventSource } from '@core/models/events';
import { normalizeTrim } from '@core/utils/normalization.util';
import { computeEditedFields } from '@core/utils/pantry-diff.util';
import { HistoryEventLogService } from './history-event-log.service';

export type StockAdjustOptions = {
  deltaQuantity: number;
  batchId?: string;
  source?: EventSource;
  expirationDate?: string;
  sessionId?: string;
};

@Injectable({ providedIn: 'root' })
export class HistoryEventManagerService {
  private readonly eventLog = inject(HistoryEventLogService);

  async logAddNewItem(item: PantryItem, addedQuantity: number, sessionId?: string, timestamp?: string) {
    const nextQuantity = sumQuantities(item.batches ?? []);
    return this.eventLog.logAddEvent({
      productId: item._id,
      productName: item.name,
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity: 0,
      nextQuantity,
      source: 'add_modal',
      categoryId: item.categoryId,
      foodType: item.foodType,
      expirationDate: item.batches?.[0]?.expirationDate,
      sessionId,
      timestamp,
    });
  }

  async logAddExistingItem(
    previousItem: PantryItem,
    updatedItem: PantryItem,
    addedQuantity: number,
    expirationDate?: string,
    sessionId?: string,
    timestamp?: string
  ) {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    return this.eventLog.logAddEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity,
      nextQuantity,
      source: 'add_modal',
      categoryId: updatedItem.categoryId,
      foodType: updatedItem.foodType,
      expirationDate,
      sessionId,
      timestamp,
    });
  }

  async logAdvancedEdit(previousItem: PantryItem, updatedItem: PantryItem, source: EventSource = 'edit_modal') {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    const editedFields = computeEditedFields(previousItem, updatedItem);
    return this.eventLog.logEditEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      quantity: nextQuantity,
      previousQuantity,
      nextQuantity,
      source,
      categoryId: updatedItem.categoryId,
      foodType: updatedItem.foodType,
      expirationDate: updatedItem.expirationDate,
      editedFields: editedFields.length > 0 ? editedFields : undefined,
    });
  }

  async logStockAdjust(
    previousItem: PantryItem | undefined,
    updatedItem: PantryItem,
    options: StockAdjustOptions
  ) {
    const { deltaQuantity, batchId, source, expirationDate, sessionId } = options;
    if (!Number.isFinite(deltaQuantity) || deltaQuantity === 0) {
      return null;
    }
    const previousQuantity = previousItem ? sumQuantities(previousItem.batches ?? []) : undefined;
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    if (previousQuantity != null && previousQuantity === nextQuantity) {
      return null;
    }
    const params = {
      productId: updatedItem._id,
      productName: previousItem?.name ?? updatedItem.name,
      quantity: Math.abs(deltaQuantity),
      deltaQuantity,
      previousQuantity,
      nextQuantity,
      batchId,
      source,
      categoryId: updatedItem.categoryId,
      foodType: updatedItem.foodType,
      expirationDate,
      sessionId,
    };
    return deltaQuantity > 0
      ? this.eventLog.logAddEvent(params)
      : this.eventLog.logConsumeEvent(params);
  }

  async logExpiredBatches(items: PantryItem[]): Promise<void> {
    const expireEvents = await this.eventLog.listEventsByType('EXPIRE');
    const seen = new Set<string>();
    for (const event of expireEvents) {
      const batchKey = normalizeTrim(String(event.sourceMetadata?.['batchKey'] ?? ''));
      if (batchKey) seen.add(batchKey);
      // Also index by productId::date so old batchId-based keys cover fresh items
      // whose batchId may have been regenerated since the event was recorded.
      const dateKey = event.productId && event.expirationDate
        ? `${event.productId}::${normalizeTrim(event.expirationDate)}`
        : null;
      if (dateKey) seen.add(dateKey);
    }

    const now = new Date();
    const tasks: Promise<unknown>[] = [];

    for (const item of items) {
      for (const batch of item.batches ?? []) {
        if (!batch?.expirationDate) continue;
        if (classifyExpiry(batch.expirationDate, now, 0) !== 'expired') continue;

        // Fresh items use a date-based key because their batchId is regenerated on every
        // consolidation — using batchId would cause duplicate EXPIRE events after any edit.
        const batchKey = item.productType === 'fresh'
          ? `${item._id}::${normalizeTrim(batch.expirationDate)}`
          : buildExpireBatchKey(item._id, batch);

        if (!batchKey || seen.has(batchKey)) continue;
        const quantity = Number.isFinite(batch.quantity) ? batch.quantity : 0;
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        seen.add(batchKey);
        tasks.push(
          this.eventLog.logExpireEvent({
            productId: item._id,
            productName: item.name,
            quantity,
            batchId: batch.batchId,
            source: 'system',
            categoryId: item.categoryId,
            foodType: item.foodType,
            expirationDate: batch.expirationDate,
            timestamp: new Date(batch.expirationDate).toISOString(),
            sourceMetadata: { batchKey },
          })
        );
      }
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  async logDeleteFromCard(item: PantryItem) {
    const totalQuantity = sumQuantities(item.batches ?? []);
    return this.eventLog.logDeleteEvent({
      productId: item._id,
      productName: item.name,
      quantity: totalQuantity,
      deltaQuantity: -totalQuantity,
      previousQuantity: totalQuantity,
      nextQuantity: 0,
      source: 'pantry_card',
      categoryId: item.categoryId,
      foodType: item.foodType,
    });
  }
}
