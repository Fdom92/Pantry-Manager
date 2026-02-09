import type { BaseDoc } from '../shared/base-doc.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE' | 'IMPORT';

export interface PantryEvent extends BaseDoc {
  type: 'event';
  eventType: PantryEventType;
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
  timestamp: string;
}
