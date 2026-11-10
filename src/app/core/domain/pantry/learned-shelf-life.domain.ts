import type { PantryEvent } from '@core/models/events';
import { normalizeProductKey } from '@core/utils/normalization.util';
import { FOOD_TYPE_PROFILE } from './food-type-profile.domain';

/** How many recent dated additions of a product the learned shelf life looks at. */
export const LEARNED_SAMPLE_SIZE = 5;

/**
 * Shelf life per product, learned from this household's own history: the median
 * days-to-expiry of the last LEARNED_SAMPLE_SIZE additions that carried a date.
 * Keyed twice: by product id (survives a rename) and by name identity (survives
 * deleting a product and adding it again). Read it with `learnedDaysFor`.
 *
 * shortcut: events do not record whether a date was typed or suggested, so an
 * addition whose date equals its type's default is skipped as the app's own
 * suggestion (learning from it would lock the suggestion in). Upgrade by storing
 * `dateFromUser` on the ADD event.
 */
export function learnShelfLifeDays(events: readonly PantryEvent[]): Map<string, number> {
  const samples = new Map<string, { at: number; days: number }[]>();
  for (const e of events) {
    if (e.eventType !== 'ADD' || !e.productName || e.daysToExpiry == null || e.daysToExpiry <= 0) continue;
    if (e.foodType && FOOD_TYPE_PROFILE[e.foodType]?.shelfLifeDays === e.daysToExpiry) continue;
    const at = Date.parse(e.timestamp);
    if (Number.isNaN(at)) continue;
    for (const key of [`id:${e.productId}`, normalizeProductKey(e.productName)]) {
      samples.set(key, [...(samples.get(key) ?? []), { at, days: e.daysToExpiry }]);
    }
  }
  const learned = new Map<string, number>();
  for (const [key, list] of samples) {
    const recent = list.sort((a, b) => b.at - a.at).slice(0, LEARNED_SAMPLE_SIZE).map(s => s.days).sort((a, b) => a - b);
    const mid = Math.floor(recent.length / 2);
    learned.set(key, recent.length % 2 ? recent[mid] : Math.round((recent[mid - 1] + recent[mid]) / 2));
  }
  return learned;
}

/** The product's own learned days: by id first (renames keep it), then by name. */
export function learnedDaysFor(learned: ReadonlyMap<string, number>, name?: string | null, productId?: string): number | undefined {
  return (productId ? learned.get(`id:${productId}`) : undefined) ?? (name ? learned.get(normalizeProductKey(name)) : undefined);
}
