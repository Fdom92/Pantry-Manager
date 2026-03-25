import type { BaseDoc } from '../shared/base-doc.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE';

export type EventSource =
  | 'fast_add'
  | 'consume_modal'
  | 'quantity_sheet'
  | 'batches_modal'
  | 'edit_modal'
  | 'pantry_card'
  | 'dashboard'
  | 'system';

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
  source?: EventSource;
  categoryId?: string;
  sourceMetadata?: Record<string, unknown>;
  readonly timestamp: string;
}
