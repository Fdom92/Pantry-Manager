import type { BaseDoc } from '../shared/base-doc.model';
import type { FoodType } from '../shared/enums.model';

export type PantryEventType = 'ADD' | 'CONSUME' | 'EDIT' | 'EXPIRE' | 'DELETE';

export type EventSource =
  | 'add_modal'
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
  /** Semantic food classification — enables coverage and nutritional trend analysis */
  foodType?: FoodType;
  /** Expiry date of the batch involved: ADD → new batch expiry, CONSUME → consumed batch expiry, EXPIRE → expired batch date */
  expirationDate?: string;
  /** Days from event timestamp until batch expiry — pre-computed at ADD time for waste prediction (negative = already expired) */
  daysToExpiry?: number;
  /** For EDIT events: list of top-level field names that changed (e.g. ['name','categoryId','batches']) */
  editedFields?: string[];
  /** Groups all events from the same user action (e.g. an add or consume session with multiple items) */
  sessionId?: string;
  sourceMetadata?: Record<string, unknown>;
  readonly timestamp: string;
}
