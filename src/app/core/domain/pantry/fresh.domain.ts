import type { ItemBatch, PantryItem, ProductStatusState } from '@core/models/pantry';
import { parseExpiryMs } from '@core/utils/date.util';
import { sumQuantities } from './pantry-batch.domain';
import { calculateUrgencyScore } from './urgency.domain';

export const FRESH_QTY = { sufficient: 3, low: 1, none: 0 } as const;

// Fresh items have estimated dates (max 2 weeks). Use a tighter near-expiry window
// so only truly urgent items (matching the card's "Pronto" label) trigger the filter.
export const FRESH_NEAR_EXPIRY_WINDOW_DAYS = 3;

export type FreshState = 'sufficient' | 'low' | 'none';

export function qtyToFreshState(qty: number): FreshState {
  if (qty >= FRESH_QTY.sufficient) return 'sufficient';
  if (qty >= FRESH_QTY.low) return 'low';
  return 'none';
}

export function freshStateToQty(state: FreshState): number {
  return FRESH_QTY[state];
}

export function isFreshKeepInStock(item: PantryItem): boolean {
  return item.isBasic === true;
}

/**
 * Devuelve la fecha de caducidad más cercana a hoy entre los lotes con fecha.
 * Prefiere fechas futuras; si todas son pasadas, devuelve la más reciente.
 */
function pickClosestExpiration(batches: ItemBatch[]): string | undefined {
  const now = Date.now();
  const dated = (batches ?? [])
    .map(b => b.expirationDate)
    .filter((d): d is string => !!d);
  if (!dated.length) return undefined;

  // Prefer the soonest future date; if all are past, prefer the most recent past date.
  // Invalid date strings are dropped — they would compare as NaN and could end
  // up as the "soonest" via sort instability.
  const parsed = dated.map(d => ({ d, ms: parseExpiryMs(d) })).filter(x => x.ms !== null) as Array<{ d: string; ms: number }>;
  if (!parsed.length) return undefined;
  const future = parsed.filter(x => x.ms >= now);
  const pool = future.length ? future : parsed;
  return pool.slice().sort((a, b) => a.ms - b.ms)[0]?.d;
}

/**
 * Consolida n lotes en un único lote apto para un fresco.
 */
export function consolidateBatchesForFresh(
  batches: ItemBatch[],
  newBatchId: string,
): ItemBatch {
  const total = sumQuantities(batches);
  const state = qtyToFreshState(total);
  const expirationDate = pickClosestExpiration(batches ?? []);
  const opened = (batches ?? []).some(b => !!b.opened);
  return {
    batchId: newBatchId,
    quantity: freshStateToQty(state),
    expirationDate,
    opened,
  };
}

export interface ConvertToFreshPreview {
  totalQty: number;
  resultingState: FreshState;
  resultingExpiration?: string;
  resultingNoExpiry: boolean;
  hadMultipleBatches: boolean;
  hadLocations: boolean;
  batchesCount: number;
}

export function buildConvertToFreshPreview(item: PantryItem): ConvertToFreshPreview {
  const batches = item.batches ?? [];
  const totalQty = sumQuantities(batches);
  return {
    totalQty,
    resultingState: qtyToFreshState(totalQty),
    resultingExpiration: pickClosestExpiration(batches),
    resultingNoExpiry: batches.length === 0 || pickClosestExpiration(batches) === undefined,
    hadMultipleBatches: batches.length > 1,
    hadLocations: batches.some(b => !!b.locationId),
    batchesCount: batches.length,
  };
}

/**
 * Maps raw daysToExpiry to a fresh-card urgency level, using calculateUrgencyScore
 * as the single source of truth for thresholds.
 *
 * Outside the 3-day fresh window → 'neutral' (item is not urgent in fresh context).
 * d=2 → 'critical' (aligns with urgency domain: 2-day band is critical).
 */
export function getFreshExpiryUrgency(days: number | null): 'critical' | 'warning' | 'neutral' {
  if (days === null) return 'neutral';
  if (days > FRESH_NEAR_EXPIRY_WINDOW_DAYS) return 'neutral'; // outside fresh 3-day window
  const state: ProductStatusState = days < 0 ? 'expired' : 'near-expiry';
  const { level } = calculateUrgencyScore(state, Math.max(0, days));
  if (level === 'critical') return 'critical';
  if (level === 'alert') return 'warning';
  return 'neutral';
}
