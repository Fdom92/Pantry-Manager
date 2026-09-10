import type { PantryItem } from '@core/models/pantry';
import { isIncomplete } from '@core/domain/pantry/pantry-filtering.domain';

/**
 * Shape of what PantryMind is willing to say about a person.
 *
 * Every field is a count, a bucket or a boolean. No names, no categories, no
 * free text — the same promise the consent screen makes about events applies
 * here, and a person profile is more durable than an event, so it matters more.
 *
 * Sizes are bucketed rather than exact for the same reason a rare value is a
 * fingerprint: "1-5 products" tells you what you need for a cohort, while
 * "exactly 137 products" starts to identify a household.
 */
export interface PersonProfile {
  pantry_size: PantrySizeBucket;
  despensa_items: number;
  fresh_items: number;
  has_items: boolean;
  /**
   * The "pendientes" backlog, using the very predicate the pantry chip and
   * the free insights already filter on — a second definition here would
   * drift from the one users actually see.
   */
  incomplete_items: number;
  days_since_first_open: number;
  onboarding_done: boolean;
  notifications_enabled: boolean;
}

export type PantrySizeBucket = 'empty' | '1-5' | '6-20' | '21-50' | '50+';

export function bucketPantrySize(count: number): PantrySizeBucket {
  if (count <= 0) return 'empty';
  if (count <= 5) return '1-5';
  if (count <= 20) return '6-20';
  if (count <= 50) return '21-50';
  return '50+';
}

/**
 * Whole days elapsed, floored, and never negative — a clock skewed into the
 * future would otherwise produce a nonsensical negative tenure.
 */
export function daysSince(from: Date | null | undefined, now: Date): number {
  if (!from || Number.isNaN(from.getTime())) {
    return 0;
  }
  const elapsedMs = now.getTime() - from.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.floor(elapsedMs / 86_400_000);
}

export function buildPersonProfile(params: {
  items: readonly PantryItem[];
  firstOpenAt: Date | null | undefined;
  now: Date;
  onboardingDone: boolean;
  notificationsEnabled: boolean;
}): PersonProfile {
  const { items, firstOpenAt, now, onboardingDone, notificationsEnabled } = params;
  const fresh = items.filter(item => item.productType === 'fresh').length;

  return {
    pantry_size: bucketPantrySize(items.length),
    despensa_items: items.length - fresh,
    fresh_items: fresh,
    has_items: items.length > 0,
    incomplete_items: items.filter(item => item.productType !== 'fresh' && isIncomplete(item)).length,
    days_since_first_open: daysSince(firstOpenAt, now),
    onboarding_done: onboardingDone,
    notifications_enabled: notificationsEnabled,
  };
}
