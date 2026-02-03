import { Injectable } from '@angular/core';
import type { BaseEventParams, EventParams, PantryEvent } from '@core/models/events';
import { buildEventQuantities } from '@core/domain/events';
import { createDocumentId } from '@core/utils';
import { StorageService } from '../shared/storage.service';

@Injectable({ providedIn: 'root' })
export class EventLogService extends StorageService<PantryEvent> {
  private readonly TYPE = 'event';

  async logAddEvent(params: BaseEventParams): Promise<PantryEvent | null> {
    return this.logEvent({
      eventType: 'ADD',
      ...params,
    });
  }

  async logConsumeEvent(params: BaseEventParams): Promise<PantryEvent | null> {
    const deltaQuantity = Number.isFinite(params.deltaQuantity)
      ? params.deltaQuantity
      : -params.quantity;
    return this.logEvent({
      eventType: 'CONSUME',
      ...params,
      deltaQuantity,
    });
  }

  async logEditEvent(params: BaseEventParams): Promise<PantryEvent | null> {
    return this.logEvent({
      eventType: 'EDIT',
      ...params,
    });
  }

  async logEvent(params: EventParams): Promise<PantryEvent | null> {
    const now = params.timestamp ?? new Date().toISOString();
    const quantities = buildEventQuantities(params);
    const payload: PantryEvent = {
      _id: createDocumentId(this.TYPE),
      type: this.TYPE,
      eventType: params.eventType,
      productId: params.productId,
      quantity: quantities.quantity,
      deltaQuantity: quantities.deltaQuantity,
      previousQuantity: quantities.previousQuantity,
      nextQuantity: quantities.nextQuantity,
      unit: params.unit,
      batchId: params.batchId,
      locationId: params.locationId,
      actorId: params.actorId,
      reason: params.reason,
      sourceMetadata: params.sourceMetadata,
      timestamp: now,
      source: params.source,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return await this.save(payload);
    } catch (err) {
      console.error('[EventLogService] logEvent error', err);
      return null;
    }
  }
}
