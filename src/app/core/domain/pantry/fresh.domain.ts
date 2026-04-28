import type { ItemBatch, PantryItem } from '@core/models/pantry';

export const FRESH_QTY = { sufficient: 3, low: 1, none: 0 } as const;

export type FreshState = 'sufficient' | 'low' | 'none';

export function qtyToFreshState(qty: number): FreshState {
  if (qty >= FRESH_QTY.sufficient) return 'sufficient';
  if (qty >= FRESH_QTY.low) return 'low';
  return 'none';
}

export function freshStateToQty(state: FreshState): number {
  return FRESH_QTY[state];
}

/**
 * Devuelve la fecha de caducidad más cercana a hoy entre los lotes con fecha.
 */
function pickClosestExpiration(batches: ItemBatch[]): string | undefined {
  const now = Date.now();
  const dated = (batches ?? [])
    .map(b => b.expirationDate)
    .filter((d): d is string => !!d);
  if (!dated.length) return undefined;
  return dated
    .slice()
    .sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now))[0];
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
    hadMultipleBatches: batches.length > 1,
    hadLocations: batches.some(b => !!b.locationId),
    batchesCount: batches.length,
  };
}
