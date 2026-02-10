import { Injectable, inject } from '@angular/core';
import { sumQuantities } from '@core/domain/pantry';
import { classifyExpiry } from '@core/domain/pantry/pantry-stock/pantry-stock';
import type { PantryItem } from '@core/models/pantry';
import { MeasurementUnit } from '@core/models/shared';
import { EventLogService } from './event-log.service';

@Injectable({ providedIn: 'root' })
export class EventManagerService {
  private readonly eventLog = inject(EventLogService);

  private getPrimaryUnit(item: PantryItem): string {
    const unit = item.batches[0]?.unit;
    if (typeof unit === 'string' && unit.trim()) {
      return unit.trim();
    }
    return MeasurementUnit.UNIT;
  }

  private getTotalQuantity(item: PantryItem): number {
    return sumQuantities(item.batches ?? []);
  }

  private buildExpireBatchKey(productId: string, batch: { batchId?: string; expirationDate?: string }): string | null {
    if (batch.batchId) {
      return `${productId}::${batch.batchId}`;
    }
    const expiry = (batch.expirationDate ?? '').trim();
    if (!expiry) {
      return null;
    }
    return `${productId}::${expiry}`;
  }

  private shouldLogQuantity(value: number | undefined): boolean {
    return Number.isFinite(value) && (value as number) > 0;
  }

  async logFastAddNewItem(item: PantryItem, addedQuantity: number, timestamp?: string) {
    const nextQuantity = this.getTotalQuantity(item);
    return this.eventLog.logAddEvent({
      productId: item._id,
      productName: item.name,
      entityType: 'product',
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity: 0,
      nextQuantity,
      unit: item.batches[0]?.unit,
      timestamp,
    });
  }

  async logFastAddExistingItem(
    previousItem: PantryItem,
    updatedItem: PantryItem,
    addedQuantity: number,
    timestamp?: string
  ) {
    const previousQuantity = this.getTotalQuantity(previousItem);
    const nextQuantity = this.getTotalQuantity(updatedItem);
    return this.eventLog.logAddEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      entityType: 'product',
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
      timestamp,
    });
  }

  async logShoppingAdd(previousItem: PantryItem, updatedItem: PantryItem, addedQuantity: number) {
    const previousQuantity = this.getTotalQuantity(previousItem);
    const nextQuantity = this.getTotalQuantity(updatedItem);
    return this.eventLog.logAddEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      entityType: 'product',
      quantity: addedQuantity,
      deltaQuantity: addedQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
    });
  }

  async logAdvancedCreate(item: PantryItem) {
    const totalQuantity = this.getTotalQuantity(item);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      return null;
    }
    return this.eventLog.logAddEvent({
      productId: item._id,
      productName: item.name,
      entityType: 'product',
      quantity: totalQuantity,
      deltaQuantity: totalQuantity,
      previousQuantity: 0,
      nextQuantity: totalQuantity,
      unit: this.getPrimaryUnit(item),
    });
  }

  async logAdvancedEdit(previousItem: PantryItem, updatedItem: PantryItem) {
    const previousQuantity = this.getTotalQuantity(previousItem);
    const nextQuantity = this.getTotalQuantity(updatedItem);
    return this.eventLog.logEditEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      entityType: 'product',
      quantity: nextQuantity,
      deltaQuantity: nextQuantity - previousQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
    });
  }

  async logQuickEdit(previousItem: PantryItem, updatedItem: PantryItem) {
    const previousQuantity = this.getTotalQuantity(previousItem);
    const nextQuantity = this.getTotalQuantity(updatedItem);
    return this.eventLog.logEditEvent({
      productId: updatedItem._id,
      productName: updatedItem.name,
      entityType: 'product',
      quantity: nextQuantity,
      deltaQuantity: nextQuantity - previousQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
    });
  }

  async logConsumeDashboard(previousItem: PantryItem, updatedItem: PantryItem, consumedQuantity: number) {
    const previousQuantity = this.getTotalQuantity(previousItem);
    const nextQuantity = this.getTotalQuantity(updatedItem);
    return this.eventLog.logConsumeEvent({
      productId: updatedItem._id,
      productName: previousItem.name,
      entityType: 'product',
      quantity: consumedQuantity,
      deltaQuantity: -consumedQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
    });
  }

  async logStockAdjust(previousItem: PantryItem | undefined, updatedItem: PantryItem, deltaQuantity: number, batchId?: string) {
    if (!Number.isFinite(deltaQuantity) || deltaQuantity === 0) {
      return null;
    }
    const previousQuantity = previousItem ? this.getTotalQuantity(previousItem) : undefined;
    const nextQuantity = this.getTotalQuantity(updatedItem);
    if (previousQuantity != null && previousQuantity === nextQuantity) {
      return null;
    }
    const quantity = Math.abs(deltaQuantity);
    if (deltaQuantity > 0) {
      return this.eventLog.logAddEvent({
        productId: updatedItem._id,
        productName: previousItem?.name ?? updatedItem.name,
        entityType: 'product',
        quantity,
        deltaQuantity,
        previousQuantity,
        nextQuantity,
        unit: this.getPrimaryUnit(updatedItem),
        batchId,
      });
    }
    return this.eventLog.logConsumeEvent({
      productId: updatedItem._id,
      productName: previousItem?.name ?? updatedItem.name,
      entityType: 'product',
      quantity,
      deltaQuantity,
      previousQuantity,
      nextQuantity,
      unit: this.getPrimaryUnit(updatedItem),
      batchId,
    });
  }

  async logExpiredBatches(items: PantryItem[]): Promise<void> {
    const existing = await this.eventLog.listEvents();
    const seen = new Set(
      existing
        .filter(event => event.eventType === 'EXPIRE')
        .map(event => String(event.sourceMetadata?.['batchKey'] ?? '').trim())
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
        if (!this.shouldLogQuantity(quantity)) {
          continue;
        }
        const expiredAt = new Date(batch.expirationDate).toISOString();
        seen.add(batchKey);
        tasks.push(
          this.eventLog.logExpireEvent({
            productId: item._id,
            productName: item.name,
            entityType: 'product',
            quantity,
            unit: batch.unit,
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
    const totalQuantity = this.getTotalQuantity(item);
    return this.eventLog.logDeleteEvent({
      productId: item._id,
      productName: item.name,
      entityType: 'product',
      quantity: totalQuantity,
      deltaQuantity: -totalQuantity,
      previousQuantity: totalQuantity,
      nextQuantity: 0,
      unit: this.getPrimaryUnit(item),
    });
  }

  logImportGlobal(totalItems: number) {
    return this.eventLog.logImportEvent({
      productId: 'import',
      entityType: 'import',
      quantity: totalItems,
      deltaQuantity: totalItems,
      previousQuantity: 0,
      nextQuantity: totalItems,
      unit: MeasurementUnit.UNIT,
      sourceMetadata: {
        importItemCount: totalItems,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
