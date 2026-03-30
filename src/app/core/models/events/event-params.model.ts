import type { FoodType } from '../shared/enums.model';
import type { EventSource, PantryEventType } from './event.model';

export type BaseEventParams = {
  productId: string;
  productName?: string;
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
  batchId?: string;
  source?: EventSource;
  categoryId?: string;
  foodType?: FoodType;
  expirationDate?: string;
  daysToExpiry?: number;
  editedFields?: string[];
  sessionId?: string;
  sourceMetadata?: Record<string, unknown>;
  timestamp?: string;
};

export type EventParams = BaseEventParams & {
  eventType: PantryEventType;
};
