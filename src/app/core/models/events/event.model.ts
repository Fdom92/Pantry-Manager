import type { BaseDoc } from '../shared/base-doc.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE';

export interface PantryEvent extends BaseDoc {
  type: 'event';
  eventType: PantryEventType;
  productId: string;
  productName?: string;
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
  unit?: string;
  batchId?: string;
  sourceMetadata?: Record<string, unknown>;
  timestamp: string;
}
