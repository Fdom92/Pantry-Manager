import type { ItemBatch, PantryItem } from '@core/models/pantry';

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
  const future = dated.filter(d => Date.parse(d) >= now);
  const pool = future.length ? future : dated;
  return pool.slice().sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

/**
 * Consolida n lotes en un único lote apto para un fresco.
 */
export function consolidateBatchesForFresh(
  batches: ItemBatch[],
  newBatchId: string,
): ItemBatch {
  const total = (batches ?? []).reduce((sum, b) => sum + (b.quantity ?? 0), 0);
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
  const totalQty = batches.reduce((sum, b) => sum + (b.quantity ?? 0), 0);
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
