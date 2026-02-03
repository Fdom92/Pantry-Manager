import type { PantryEventSource, PantryEventType } from './event.model';

export type BaseEventParams = {
  productId: string;
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
  unit?: string;
  batchId?: string;
  locationId?: string;
  actorId?: string;
  reason?: string;
  sourceMetadata?: Record<string, unknown>;
  source: PantryEventSource;
  timestamp?: string;
};

export type EventParams = BaseEventParams & {
  eventType: PantryEventType;
};
