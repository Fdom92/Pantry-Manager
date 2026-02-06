import type { BaseDoc } from '../shared/base-doc.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE';

export type PantryEventSource =
  | 'fast-add'
  | 'advanced'
  | 'consume'
  | 'import'
  | 'shopping'
  | 'quick-edit'
  | 'stock-adjust'
  | 'system'
  | 'edit'
  | 'unknown';

export interface PantryEvent extends BaseDoc {
  type: 'event';
  eventType: PantryEventType;
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
  timestamp: string;
  source: PantryEventSource;
}
