import type { PantryEvent } from '@core/models/events';
import type { PantryItem } from '@core/models/pantry';
import { sumQuantities } from '@core/domain/pantry/pantry-batch.domain';

const DAY_MS = 86_400_000;

/** No stock movement for this long and the product is probably forgotten. */
export const STALE_AFTER_DAYS = 60;
/** Consumed this close to its date counts as "saved in time". */
export const SAVED_WINDOW_DAYS = 7;

export interface StaleProduct {
  item: PantryItem;
  /** Days since anything happened to it, or since it was created. */
  idleDays: number;
}

/**
 * Products with stock that nothing has touched in STALE_AFTER_DAYS: no add, use,
 * edit or discard. Longest-idle first. Edits count, so a product the user just
 * checked does not show up.
 */
export function computeStaleProducts(items: readonly PantryItem[], events: readonly PantryEvent[], now: Date): StaleProduct[] {
  const lastTouched = new Map<string, number>();
  for (const e of events) {
    if (e.eventType === 'EXPIRE' && e.source !== 'discard') continue; // the sweep is not the user
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) continue;
    lastTouched.set(e.productId, Math.max(lastTouched.get(e.productId) ?? 0, t));
  }
  const out: StaleProduct[] = [];
  for (const item of items) {
    if (sumQuantities(item.batches) <= 0) continue;
    const created = Date.parse(item.createdAt ?? '');
    const last = Math.max(lastTouched.get(item._id) ?? 0, Number.isNaN(created) ? 0 : created);
    if (!last) continue;
    const idleDays = Math.floor((now.getTime() - last) / DAY_MS);
    if (idleDays >= STALE_AFTER_DAYS) out.push({ item, idleDays });
  }
  return out.sort((a, b) => b.idleDays - a.idleDays);
}

export interface TopUsedProduct {
  productId: string;
  name: string;
  units: number;
  /** True when it is not marked as a basic: the card offers to mark it. */
  suggestBasic: boolean;
}

/** The `limit` products consumed most in the last `windowDays`, among those still in the catalogue. */
export function computeTopUsed(
  items: readonly PantryItem[],
  events: readonly PantryEvent[],
  now: Date,
  windowDays = 90,
  limit = 5,
): TopUsedProduct[] {
  const since = now.getTime() - windowDays * DAY_MS;
  const units = new Map<string, number>();
  for (const e of events) {
    if (e.eventType !== 'CONSUME') continue;
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t) || t < since || t > now.getTime()) continue;
    units.set(e.productId, (units.get(e.productId) ?? 0) + (Number.isFinite(e.quantity) ? e.quantity : 0));
  }
  const byId = new Map(items.map(i => [i._id, i]));
  return [...units.entries()]
    .filter(([id, n]) => byId.has(id) && n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, n]) => {
      const item = byId.get(id) as PantryItem;
      return { productId: id, name: item.name, units: n, suggestBasic: !item.isBasic };
    });
}

/**
 * In the last `windowDays`: products used up within SAVED_WINDOW_DAYS of their
 * date ("saved") against products that went to waste. Counted per product, as
 * the waste card counts.
 */
export function computeSavedInTime(
  events: readonly PantryEvent[],
  now: Date,
  windowDays = 30,
): { saved: number; wasted: number } {
  const since = now.getTime() - windowDays * DAY_MS;
  const saved = new Set<string>();
  const wasted = new Set<string>();
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t) || t < since || t > now.getTime()) continue;
    if (e.eventType === 'EXPIRE') wasted.add(e.productId);
    else if (e.eventType === 'CONSUME' && e.daysToExpiry != null && e.daysToExpiry >= 0 && e.daysToExpiry <= SAVED_WINDOW_DAYS) {
      saved.add(e.productId);
    }
  }
  return { saved: saved.size, wasted: wasted.size };
}
