import type { ProductStatusState } from '@core/models/pantry';

/**
 * Semantic urgency levels — three bands with clear meaning:
 *   critical   → act now (expired or expires within 2 days)
 *   alert      → plan soon (3-5 days, or flexible-review past printed date)
 *   preventive → watch (6-15 days)
 *   none       → no action needed
 */
export type UrgencyLevel = 'critical' | 'alert' | 'preventive' | 'none';

export interface UrgencyResult {
  score: number;
  level: UrgencyLevel;
}

/**
 * Single source of truth for item urgency across the entire app.
 * Used by HOY, dashboard actions, insights, and any other urgency-aware feature.
 *
 * Score table:
 *   expired               → 100  critical
 *   today + tomorrow (≤1) →  95  critical  (0-1 days treated equally — both require action today)
 *   2 days                →  90  critical
 *   3-5 days              →  80  alert
 *   review (grace)        →  55  alert    ← past printed date, still consumable
 *   6-10 days             →  60  alert
 *   11-15 days            →  40  preventive
 *   otherwise             →   0  none
 *
 * Negative daysToExpiry (timezone edge-cases: same-day expiry parsed as -0.x, ceil = 0)
 * is normalised to 0 (today, score 95).
 */
export function calculateUrgencyScore(
  state: ProductStatusState,
  daysToExpiry: number | null,
): UrgencyResult {
  if (state === 'expired') return { score: 100, level: 'critical' };
  if (state === 'review')  return { score: 55,  level: 'alert' };

  if (daysToExpiry !== null) {
    const d = Math.max(0, daysToExpiry); // normalise negative (timezone edge) → 0 (today)
    if (d <= 1)   return { score: 95, level: 'critical' }; // today + tomorrow
    if (d === 2)  return { score: 90, level: 'critical' };
    if (d <= 5)   return { score: 80, level: 'alert' };
    if (d <= 10)  return { score: 60, level: 'alert' };
    if (d <= 15)  return { score: 40, level: 'preventive' };
  }

  return { score: 0, level: 'none' };
}
