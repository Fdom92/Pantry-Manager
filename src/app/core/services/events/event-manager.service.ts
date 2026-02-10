import { Injectable, inject } from '@angular/core';
import { classifyExpiry, sumQuantities } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import { normalizeTrim, normalizeWhitespace } from '@core/utils/normalization.util';
import { EventLogService } from './event-log.service';

@Injectable({ providedIn: 'root' })
export class EventManagerService {
  private readonly eventLog = inject(EventLogService);

  private buildExpireBatchKey(productId: string, batch: { batchId?: string; expirationDate?: string }): string | null {
    if (batch.batchId) {
      return `${productId}::${batch.batchId}`;
    }
    const expiry = normalizeWhitespace(batch.expirationDate);
    if (!expiry) {
      return null;
    }
    return `${productId}::${expiry}`;
  }

  async logFastAddNewItem(item: PantryItem, addedQuantity: number, timestamp?: string) {
    const nextQuantity = sumQuantities(item.batches ?? []);
    return this.eventLog.logAddEvent({
      productId: item._id,
      productName: item.name,
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity: 0,
      nextQuantity,
      timestamp,
    });
  }

  async logFastAddExistingItem(
    previousItem: PantryItem,
    updatedItem: PantryItem,
    addedQuantity: number,
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
      timestamp,
    });
  }

  async logShoppingAdd(previousItem: PantryItem, updatedItem: PantryItem, addedQuantity: number) {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    return this.eventLog.logAddEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity,
      nextQuantity,
    });
  }

  async logAdvancedCreate(item: PantryItem) {
    const totalQuantity = sumQuantities(item.batches ?? []);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      return null;
    }
    return this.eventLog.logAddEvent({
      productId: item._id,
      productName: item.name,
      quantity: totalQuantity,
      deltaQuantity: totalQuantity,
      previousQuantity: 0,
      nextQuantity: totalQuantity,
    });
  }

  async logAdvancedEdit(previousItem: PantryItem, updatedItem: PantryItem) {
    return this.logEditWithDelta(previousItem, updatedItem);
  }

  async logQuickEdit(previousItem: PantryItem, updatedItem: PantryItem) {
    return this.logEditWithDelta(previousItem, updatedItem);
  }

  private logEditWithDelta(previousItem: PantryItem, updatedItem: PantryItem) {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    return this.eventLog.logEditEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      quantity: nextQuantity,
      deltaQuantity: nextQuantity - previousQuantity,
      previousQuantity,
      nextQuantity,
    });
  }

  async logConsumeDashboard(previousItem: PantryItem, updatedItem: PantryItem, consumedQuantity: number) {
    const previousQuantity = sumQuantities(previousItem.batches ?? []);
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    return this.eventLog.logConsumeEvent({
      productId: updatedItem._id,
      productName: previousItem.name,
      quantity: consumedQuantity,
      deltaQuantity: -consumedQuantity,
      previousQuantity,
      nextQuantity,
    });
  }

  async logStockAdjust(previousItem: PantryItem | undefined, updatedItem: PantryItem, deltaQuantity: number, batchId?: string) {
    if (!Number.isFinite(deltaQuantity) || deltaQuantity === 0) {
      return null;
    }
    const previousQuantity = previousItem ? sumQuantities(previousItem.batches ?? []) : undefined;
    const nextQuantity = sumQuantities(updatedItem.batches ?? []);
    if (previousQuantity != null && previousQuantity === nextQuantity) {
      return null;
    }
    const quantity = Math.abs(deltaQuantity);
    return this.logStockEvent({
      productId: updatedItem._id,
      productName: previousItem?.name ?? updatedItem.name,
      quantity,
      deltaQuantity,
      previousQuantity,
      nextQuantity,
      batchId,
    });
  }

  async logExpiredBatches(items: PantryItem[]): Promise<void> {
    const existing = await this.eventLog.listEvents();
    const seen = new Set(
      existing
        .filter(event => event.eventType === 'EXPIRE')
        .map(event => normalizeTrim(String(event.sourceMetadata?.['batchKey'] ?? '')))
        .filter(Boolean)
    );
    const now = new Date();
    const tasks: Promise<unknown>[] = [];

    for (const item of items) {
      for (const batch of item.batches ?? []) {
        if (!batch?.expirationDate) {
          continue;
        }
        if (classifyExpiry(batch.expirationDate, now, 0) !== 'expired') {
          continue;
        }
        const batchKey = this.buildExpireBatchKey(item._id, batch);
        if (!batchKey || seen.has(batchKey)) {
          continue;
        }
        const quantity = Number.isFinite(batch.quantity) ? batch.quantity : 0;
        if (!Number.isFinite(quantity) || quantity <= 0) {
          continue;
        }
        const expiredAt = new Date(batch.expirationDate).toISOString();
        seen.add(batchKey);
        tasks.push(
          this.eventLog.logExpireEvent({
            productId: item._id,
            productName: item.name,
            quantity,
            batchId: batch.batchId,
            timestamp: expiredAt,
            sourceMetadata: {
              batchKey,
              expirationDate: batch.expirationDate,
            },
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
    });
  }

  private logStockEvent(params: {
    productId: string;
    productName?: string;
    quantity: number;
    deltaQuantity: number;
    previousQuantity?: number;
    nextQuantity: number;
    batchId?: string;
  }) {
    if (params.deltaQuantity > 0) {
      return this.eventLog.logAddEvent(params);
    }
    return this.eventLog.logConsumeEvent(params);
  }

}
