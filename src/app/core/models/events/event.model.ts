import type { BaseDoc } from '../shared/base-doc.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE';

export interface PantryEvent extends BaseDoc {
  readonly type: 'event';
  readonly eventType: PantryEventType;
  readonly productId: string;
  productName?: string;
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
  batchId?: string;
  sourceMetadata?: Record<string, unknown>;
  readonly timestamp: string;
}
