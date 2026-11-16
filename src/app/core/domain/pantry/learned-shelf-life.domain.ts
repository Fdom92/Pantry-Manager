import type { PantryEvent } from '@core/models/events';
import type { FoodType } from '@core/models/shared/enums.model';
import { normalizeProductKey } from '@core/utils/normalization.util';
import { LEGACY_SHELF_LIFE_DAYS } from './expiry-suggestion.domain';
import { resolveFoodClass } from './food-class-resolution.domain';
import type { LearnedDays } from './food-type-inference.domain';

/** How many recent dated additions of a product the learned shelf life looks at. */
export const LEARNED_SAMPLE_SIZE = 5;
/** A class needs this many dated additions before it overrides the table. */
export const LEARNED_CLASS_MIN_SAMPLES = 3;

export interface LearnedShelfLife {
  byProduct: Map<string, number>;
  byClass: Map<string, number>;
}

const median = (list: { at: number; days: number }[]): number => {
  const recent = [...list].sort((a, b) => b.at - a.at).slice(0, LEARNED_SAMPLE_SIZE).map(s => s.days).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  return recent.length % 2 ? recent[mid] : Math.round((recent[mid - 1] + recent[mid]) / 2);
};

/**
 * Shelf life learned from this household's own history: the median days-to-expiry
 * of the last LEARNED_SAMPLE_SIZE additions whose date the user chose. Per product
 * (by id, survives a rename; by name identity, survives delete and re-add) and per
 * food class (only with LEARNED_CLASS_MIN_SAMPLES). Read it with `learnedDaysFor`.
 *
 * Old events lack `dateFromUser`: they count unless their date equals the 5.7
 * default of their type, which was the app's own suggestion. Frozen lots carry no
 * positive days, so they drop out with the `<= 0` check.
 */
export function learnShelfLifeDays(events: readonly PantryEvent[]): LearnedShelfLife {
  const samples = new Map<string, { at: number; days: number }[]>();
  const classSamples = new Map<string, { at: number; days: number }[]>();
  const push = (m: Map<string, { at: number; days: number }[]>, key: string, s: { at: number; days: number }) =>
    m.set(key, [...(m.get(key) ?? []), s]);
  for (const e of events) {
    if (e.eventType !== 'ADD' || !e.productName || e.daysToExpiry == null || e.daysToExpiry <= 0) continue;
    if (e.dateFromUser === false) continue;
    if (e.dateFromUser === undefined && e.foodType && LEGACY_SHELF_LIFE_DAYS[e.foodType] === e.daysToExpiry) continue;
    const at = Date.parse(e.timestamp);
    if (Number.isNaN(at)) continue;
    const sample = { at, days: e.daysToExpiry };
    for (const key of [`id:${e.productId}`, normalizeProductKey(e.productName)]) push(samples, key, sample);
    const klass = resolveFoodClass(e.productName, e.foodType, e.foodKind);
    if (klass) push(classSamples, klass.key, sample);
  }
  const byProduct = new Map<string, number>();
  for (const [key, list] of samples) byProduct.set(key, median(list));
  const byClass = new Map<string, number>();
  for (const [key, list] of classSamples) if (list.length >= LEARNED_CLASS_MIN_SAMPLES) byClass.set(key, median(list));
  return { byProduct, byClass };
}

/** Product days by id first (renames keep it) then name; class days by stored kind, else by name/type. */
export function learnedDaysFor(
  learned: LearnedShelfLife,
  name?: string | null,
  productId?: string,
  foodKind?: string | null,
  foodType?: FoodType | null,
): LearnedDays {
  const product = (productId ? learned.byProduct.get(`id:${productId}`) : undefined)
    ?? (name ? learned.byProduct.get(normalizeProductKey(name)) : undefined);
  const klass = resolveFoodClass(name ?? '', foodType, foodKind);
  return { product, klass: klass ? learned.byClass.get(klass.key) : undefined };
}
