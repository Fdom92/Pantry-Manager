import { Injectable } from '@angular/core';
import type { BaseEventParams, EventParams, PantryEvent } from '@core/models/events';
import { buildEventQuantities } from '@core/domain/events';
import { createDocumentId } from '@core/utils';
import { StorageService } from '../shared/storage.service';

@Injectable({ providedIn: 'root' })
export class HistoryEventLogService extends StorageService<PantryEvent> {
  private readonly TYPE = 'event';

  async listEvents(): Promise<PantryEvent[]> {
    const events = await this.all(this.TYPE);
    return this.sortByTimestamp(events);
  }

  async listEventsByType(eventType: PantryEvent['eventType']): Promise<PantryEvent[]> {
    const events = await this.findByField('eventType', eventType);
    return this.sortByTimestamp(events);
  }

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

  async logExpireEvent(params: BaseEventParams): Promise<PantryEvent | null> {
    return this.logEvent({
      eventType: 'EXPIRE',
      ...params,
    });
  }

  async logDeleteEvent(params: BaseEventParams): Promise<PantryEvent | null> {
    return this.logEvent({
      eventType: 'DELETE',
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
      productName: params.productName,
      quantity: quantities.quantity,
      deltaQuantity: quantities.deltaQuantity,
      previousQuantity: quantities.previousQuantity,
      nextQuantity: quantities.nextQuantity,
      batchId: params.batchId,
      sourceMetadata: params.sourceMetadata,
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return await this.save(payload);
    } catch (err) {
      console.error('[HistoryEventLogService] logEvent error', err);
      return null;
    }
  }

  private sortByTimestamp(events: PantryEvent[]): PantryEvent[] {
    const toTime = (value: string): number => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    return [...events].sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp));
  }

}
