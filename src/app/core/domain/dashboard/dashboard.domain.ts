import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { getItemStatusState } from '@core/domain/pantry/pantry-status.domain';
import { calculateUrgencyScore } from '@core/domain/pantry/urgency.domain';
import { sumQuantities } from '@core/domain/pantry/pantry-batch.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import { daysUntilExpiry, parseExpiryMs } from '@core/utils/date.util';

// ─── HOY Block — v2 final architecture ───────────────────────────────────────
//
// Four explicit layers, each with a single responsibility:
//
//   LAYER 1 — ACTIVATION      who enters the pipeline (temporal rules only)
//   LAYER 2 — PRIORITY CORE   how urgent each candidate is (urgency + review boost)
//   LAYER 3 — MODULATION      visual context enrichment (food type, fresh, stock)
//                              these are display signals, NOT scoring inputs
//   LAYER 4 — DISPLAY         what the user sees (1 protagonist + secondaries)
//
// Core invariants:
//   • Priority = urgencyScore + reviewBoost ONLY. Food type, fresh status,
//     and stock level do not influence ordering — they appear in the UI as
//     contextual signals, never as scoring terms.
//   • Display cutoff: priorityScore >= 60 OR state === 'review'.
//   • Anti-noise floor: priorityScore < 10 → always excluded.
//   • Deterministic: same inputs → same output.

const HOY_REVIEW_BOOST   = 10;
const HOY_DISPLAY_CUTOFF = 60;
const HOY_ANTI_NOISE_MIN = 10;

export interface TodaySuggestionItem {
  id: string;
  name: string;
  quantity: number;
  expirationDate?: string;
  daysToExpiry: number | null;
}

export interface TodaySuggestion {
  protagonist: TodaySuggestionItem;
  reasonKey: string;
  secondaryItems: TodaySuggestionItem[];
}

/**
 * Deterministic HOY engine — four-layer pipeline.
 *
 * @param _nearExpiryItems - unused (kept for API compatibility); allItems is the source
 * @param allItems         - full pantry snapshot
 * @param skipId           - protagonist from last session; deprioritised when a
 *                           comparable alternative (within 15 pts) exists
 */
export function computeTodaySuggestion(
  _nearExpiryItems: PantryItem[],
  allItems: PantryItem[],
  skipId?: string,
): TodaySuggestion | null {
  const nowMs = Date.now();
  const now = new Date(nowMs);

  const getStock = (item: PantryItem): number => sumQuantities(item.batches);

  const getEarliestExpiryDate = (item: PantryItem): string | undefined => {
    const parsed = (item.batches ?? [])
      .map(b => ({ b, ms: parseExpiryMs(b.expirationDate) }))
      .filter(x => x.ms !== null) as Array<{ b: { expirationDate?: string }; ms: number }>;
    parsed.sort((a, b) => a.ms - b.ms);
    return parsed[0]?.b.expirationDate;
  };

  const getDaysToExpiry = (item: PantryItem): number | null => {
    const date = getEarliestExpiryDate(item);
    return date ? daysUntilExpiry(date, nowMs) : null;
  };

  const getState = (item: PantryItem) => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

  const isFood   = (item: PantryItem): boolean => item.foodType !== FoodType.HOUSEHOLD;
  const hasStock = (item: PantryItem): boolean => getStock(item) > 0;

  const toItem = (item: PantryItem): TodaySuggestionItem => ({
    id: item._id,
    name: item.name,
    quantity: getStock(item),
    expirationDate: getEarliestExpiryDate(item),
    daysToExpiry: getDaysToExpiry(item),
  });

  // ── LAYER 1 — ACTIVATION ─────────────────────────────────────────────────

  const hasValidUrgency = (item: PantryItem): boolean => {
    const state = getState(item);
    if (item.productType === 'fresh') {
      return state === 'near-expiry';
    }
    if (state === 'review' || state === 'near-expiry') return true;
    const days = getDaysToExpiry(item);
    return days !== null && days >= 0;
  };

  const candidatePool = allItems.filter(
    i => isFood(i) && hasStock(i) && hasValidUrgency(i),
  );

  if (!candidatePool.length) return null;

  // ── LAYER 2 — PRIORITY CORE ──────────────────────────────────────────────

  const scoredCandidates = candidatePool.map(item => {
    const days  = getDaysToExpiry(item);
    const state = getState(item);

    const urgencyScore  = calculateUrgencyScore(state, days).score;
    const reviewBoost   = state === 'review' ? HOY_REVIEW_BOOST : 0;
    const priorityScore = urgencyScore + reviewBoost;

    return { item, priorityScore, days, state };
  });

  // ── LAYER 3 — MODULATION (visual context only, no scoring) ───────────────

  const sortCandidates = (
    a: { item: PantryItem; priorityScore: number; days: number | null },
    b: { item: PantryItem; priorityScore: number; days: number | null },
  ): number => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const ad = a.days ?? Infinity;
    const bd = b.days ?? Infinity;
    if (ad !== bd) return ad - bd;
    return getStock(b.item) - getStock(a.item);
  };

  // ── LAYER 4 — DISPLAY ────────────────────────────────────────────────────

  const isAboveCutoff = (sc: { priorityScore: number; state: string }): boolean =>
    sc.priorityScore >= HOY_DISPLAY_CUTOFF || sc.state === 'review';

  const ranked = scoredCandidates
    .filter(sc => sc.priorityScore >= HOY_ANTI_NOISE_MIN && isAboveCutoff(sc))
    .sort(sortCandidates);

  if (!ranked.length) return null;

  let topIndex = 0;
  if (
    skipId
    && ranked[0].item._id === skipId
    && ranked.length > 1
    && ranked[0].priorityScore - ranked[1].priorityScore < 15
  ) {
    topIndex = 1;
  }

  const { item: protagonist, days: protagonistDays, state: protagonistState } = ranked[topIndex];

  const isFreshProtagonist = protagonist.productType === 'fresh';

  let reasonKey: string;
  if (isFreshProtagonist) {
    reasonKey = 'dashboard.today.reason.freshExpiring';
  } else if (protagonistState === 'review') {
    reasonKey = 'dashboard.today.reason.reviewExpiry';
  } else if (protagonistDays === null || protagonistDays <= 2) {
    reasonKey = 'dashboard.today.reason.expiringsoon';
  } else if (protagonistDays <= 5) {
    reasonKey = 'dashboard.today.reason.expirestoday';
  } else {
    reasonKey = 'dashboard.today.reason.expiringlater';
  }

  const secondaryPool = ranked
    .filter(({ item }) => item._id !== protagonist._id)
    .slice(0, 2)
    .map(({ item }) => toItem(item));

  return {
    protagonist: toItem(protagonist),
    reasonKey,
    secondaryItems: secondaryPool,
  };
}
