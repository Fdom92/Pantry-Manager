import { Injectable, inject } from '@angular/core';
import { sumQuantities } from '@core/domain/pantry';
import { selectUnloggedExpiredBatches } from '@core/domain/events';
import type { PantryItem } from '@core/models/pantry';
import type { EventSource } from '@core/models/events';
import { computeEditedFields } from '@core/utils/pantry-diff.util';
import { Subject } from 'rxjs';
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

  private readonly _mutation$ = new Subject<void>();
  /** Emits once after every event that is persisted to the event log. */
  readonly mutation$ = this._mutation$.asObservable();

  async logAddNewItem(item: PantryItem, addedQuantity: number, sessionId?: string, timestamp?: string) {
    const nextQuantity = sumQuantities(item.batches ?? []);
    const result = await this.eventLog.logAddEvent({
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
    this._mutation$.next();
    return result;
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
    const result = await this.eventLog.logAddEvent({
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
    this._mutation$.next();
    return result;
  }

  async logAdvancedEdit(previousItem: PantryItem, updatedItem: PantryItem, source: EventSource = 'edit_modal') {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    const editedFields = computeEditedFields(previousItem, updatedItem);
    const result = await this.eventLog.logEditEvent({
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
    this._mutation$.next();
    return result;
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
    const result = await (deltaQuantity > 0
      ? this.eventLog.logAddEvent(params)
      : this.eventLog.logConsumeEvent(params));
    this._mutation$.next();
    return result;
  }

  async logExpiredBatches(items: PantryItem[]): Promise<void> {
    const previousEvents = await this.eventLog.listEventsByType('EXPIRE');
    const pending = selectUnloggedExpiredBatches(items, previousEvents, new Date());
    if (!pending.length) {
      return;
    }

    await Promise.all(pending.map(({ item, batch, batchKey, quantity }) =>
      this.eventLog.logExpireEvent({
        productId: item._id,
        productName: item.name,
        quantity,
        batchId: batch.batchId,
        source: 'system',
        categoryId: item.categoryId,
        foodType: item.foodType,
        expirationDate: batch.expirationDate,
        timestamp: new Date(batch.expirationDate as string).toISOString(),
        sourceMetadata: { batchKey },
      })
    ));
    // Do not emit mutation$ — expired-batch logging is a system housekeeping
    // task, not a user action. Emitting here incorrectly triggers streak
    // evaluation on view navigation (e.g. Dashboard ionViewWillEnter).
  }

  async logDeleteFromCard(item: PantryItem) {
    const totalQuantity = sumQuantities(item.batches ?? []);
    const result = await this.eventLog.logDeleteEvent({
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
    this._mutation$.next();
    return result;
  }
}
