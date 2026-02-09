import type { PantryEventType } from './event.model';

export type BaseEventParams = {
  productId: string;
  productName?: string;
  entityType?: 'product' | 'import';
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
  unit?: string;
  batchId?: string;
  sourceMetadata?: Record<string, unknown>;
  timestamp?: string;
};

export type EventParams = BaseEventParams & {
  eventType: PantryEventType;
};
