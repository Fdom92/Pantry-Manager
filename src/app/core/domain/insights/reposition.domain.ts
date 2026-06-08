import type { PantryItem } from '@core/models/pantry/item.model';
import type { PantryEvent } from '@core/models/events';
import { sumQuantities } from '@core/domain/pantry/pantry-batch.domain';

export interface RepositionPrediction {
  productId: string;
  productName: string;
  categoryId?: string;
  currentStock: number;
  velocityPerDay: number;
  daysToOut: number;
  confidence: 'medium' | 'high';
}

const WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const VELOCITY_THRESHOLD = 0.05;
const DAYS_TO_OUT_CAP = 90;

export function computeRepositionPredictions(
  items: ReadonlyArray<PantryItem>,
  events: ReadonlyArray<PantryEvent>,
  now: Date,
): RepositionPrediction[] {
  const nowMs = now.getTime();
  const windowStart = nowMs - WINDOW_DAYS * MS_PER_DAY;

  const consumeAgg = new Map<string, { qty: number; count: number }>();
  for (const e of events) {
    if (e.eventType !== 'CONSUME') continue;
    const t = new Date(e.timestamp).getTime();
    if (Number.isNaN(t) || t < windowStart || t > nowMs) continue;
    const prev = consumeAgg.get(e.productId) ?? { qty: 0, count: 0 };
    prev.qty += Number.isFinite(e.quantity) ? e.quantity : 0;
    prev.count += 1;
    consumeAgg.set(e.productId, prev);
  }

  const out: RepositionPrediction[] = [];
  for (const itm of items) {
    if (itm.productType === 'fresh') continue;
    const agg = consumeAgg.get(itm._id);
    if (!agg) continue;
    if (agg.count < 3) continue;
    const velocityPerDay = agg.qty / WINDOW_DAYS;
    if (velocityPerDay < VELOCITY_THRESHOLD) continue;
    const currentStock = sumQuantities(itm.batches);
    if (currentStock <= 0) continue;
    const daysToOut = Math.min(DAYS_TO_OUT_CAP, Math.round(currentStock / velocityPerDay));
    const confidence: RepositionPrediction['confidence'] = agg.count >= 10 ? 'high' : 'medium';
    out.push({
      productId: itm._id,
      productName: itm.name,
      categoryId: itm.categoryId,
      currentStock,
      velocityPerDay,
      daysToOut,
      confidence,
    });
  }
  return out.sort((a, b) => a.daysToOut - b.daysToOut);
}
