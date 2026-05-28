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
 *
 * Score table:
 *   expired            → 100  critical
 *   expires today      →  95  critical  ← daysToExpiry === 0
 *   expires tomorrow   →  90  critical
 *   expires in 2 days  →  80  critical
 *   expires in 3-5d    →  60  alert
 *   review (grace)     →  55  alert    ← past printed date, still consumable
 *   expires in 6-10d   →  30  preventive
 *   expires in 11-15d  →  15  preventive
 *   otherwise          →   0  none
 */
export function calculateUrgencyScore(
  state: ProductStatusState,
  daysToExpiry: number | null,
): UrgencyResult {
  if (state === 'expired') return { score: 100, level: 'critical' };
  if (state === 'review')  return { score: 55,  level: 'alert' };

  if (daysToExpiry !== null && daysToExpiry >= 0) {
    if (daysToExpiry === 0) return { score: 95,  level: 'critical' };
    if (daysToExpiry === 1) return { score: 90,  level: 'critical' };
    if (daysToExpiry === 2) return { score: 80,  level: 'critical' };
    if (daysToExpiry <= 5)  return { score: 60,  level: 'alert' };
    if (daysToExpiry <= 10) return { score: 30,  level: 'preventive' };
    if (daysToExpiry <= 15) return { score: 15,  level: 'preventive' };
  }

  return { score: 0, level: 'none' };
}
