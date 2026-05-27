import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { getItemStatusState } from '@core/domain/pantry/pantry-status.domain';
import { calculateUrgencyScore } from '@core/domain/pantry/urgency.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

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
//     Score 60 = 6-10 day band ("plan soon"). Items below this threshold
//     (> 10 days, score 40 = "watch") are suppressed — HOY is for action.
//   • Anti-noise floor: priorityScore < 10 → always excluded.
//   • Deterministic: same inputs → same output.

// ─── Layer 2 constants ────────────────────────────────────────────────────────

/**
 * Review boost — reinforces "past printed date, still consumable" context.
 * Applied on top of the base urgency score (55), giving review items 65 total
 * and keeping them above the display cutoff (60).
 */
const HOY_REVIEW_BOOST = 10;

// ─── Layer 4 constants ────────────────────────────────────────────────────────

/**
 * Display cutoff — a candidate must score >= 60 OR be in 'review' state
 * to appear in HOY. Score 60 corresponds to the 6-10 day urgency band:
 * "plan soon" territory where surfacing an item adds real value.
 *
 * Items scoring 40 (11-15 day "watch" band) are silently excluded — the
 * user doesn't need a daily nudge for something expiring in two weeks.
 */
const HOY_DISPLAY_CUTOFF = 60;

/**
 * Anti-noise floor — belt-and-suspenders guard against zero-urgency items
 * that bypass the display cutoff. In practice this only fires on edge cases
 * (e.g. state mismatch after timezone normalisation).
 */
const HOY_ANTI_NOISE_MIN = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

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

  // ── Shared item helpers (used across all layers) ─────────────────────────

  const getStock = (item: PantryItem): number =>
    (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);

  const getEarliestExpiryDate = (item: PantryItem): string | undefined =>
    (item.batches ?? [])
      .filter(b => b.expirationDate)
      .sort((a, b) => Date.parse(a.expirationDate!) - Date.parse(b.expirationDate!))[0]
      ?.expirationDate;

  const getDaysToExpiry = (item: PantryItem): number | null => {
    const date = getEarliestExpiryDate(item);
    return date ? Math.ceil((Date.parse(date) - nowMs) / 86_400_000) : null;
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

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 1 — ACTIVATION
  //
  // Answers: "does this item belong in the HOY pipeline?"
  // Rules: temporal urgency only. No scoring, no thresholds, no food-type gates.
  //
  //   hasValidUrgency: item is near-expiry, review, or has a known future date
  //   hasStock:        item has stock (qty > 0) — exhausted items never surface
  //   isFood:          item is not a household product
  //
  // Items that fail activation are ignored entirely.
  // ───────────────────────────────────────────────────────────────────────────

  const hasValidUrgency = (item: PantryItem): boolean => {
    const state = getState(item);
    // Fresh items use a 3-day near-expiry window (not the 15-day pantry window).
    // Admit only via state so HOY stays consistent with the rest of the app.
    // Raw daysToExpiry >= 0 would admit fresh items the pantry considers 'normal'.
    if (item.productType === 'fresh') {
      return state === 'near-expiry';
    }
    // review items are past their printed date but still consumable — always admit
    if (state === 'review' || state === 'near-expiry') return true;
    // pantry items with a known future date: daysToExpiry >= 0
    // (display cutoff in Layer 4 removes those beyond the action threshold)
    const days = getDaysToExpiry(item);
    return days !== null && days >= 0;
  };

  const candidatePool = allItems.filter(
    i => isFood(i) && hasStock(i) && hasValidUrgency(i),
  );

  if (!candidatePool.length) return null;

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 2 — PRIORITY CORE
  //
  // Answers: "how urgent is this candidate right now?"
  //
  // Formula (additive, two terms):
  //   priorityScore = urgencyScore + reviewBoost
  //
  // urgencyScore — from calculateUrgencyScore(), single source of truth:
  //   expired      → 100   critical
  //   ≤ 1 day      →  95   critical
  //   2 days       →  90   critical
  //   3-5 days     →  80   alert
  //   review state →  55   alert  (base; reviewBoost lifts to 65)
  //   6-10 days    →  60   alert
  //   11-15 days   →  40   preventive  ← below HOY_DISPLAY_CUTOFF; excluded
  //
  // reviewBoost (+10) is the only secondary term. Food type, fresh status,
  // and stock level do NOT influence priority score — see Layer 3.
  // ───────────────────────────────────────────────────────────────────────────

  const scoredCandidates = candidatePool.map(item => {
    const days  = getDaysToExpiry(item);
    const state = getState(item);

    const urgencyScore  = calculateUrgencyScore(state, days).score;
    const reviewBoost   = state === 'review' ? HOY_REVIEW_BOOST : 0;
    const priorityScore = urgencyScore + reviewBoost;

    return { item, priorityScore, days, state };
  });

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 3 — MODULATION (visual context — does NOT affect ordering)
  //
  // These signals are consumed by the template to render contextual labels:
  //   • item.productType === 'fresh'   → "fecha aproximada" label
  //   • item.foodType                  → food-type badge
  //   • stock vs. minThreshold         → low-stock indicator
  //
  // No computation here — values are read directly from PantryItem downstream.
  // ───────────────────────────────────────────────────────────────────────────

  // Tiebreaker sort: priorityScore DESC → daysToExpiry ASC (closer = more urgent) → stock DESC
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

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 4 — DISPLAY
  //
  // Answers: "what does the user see?"
  //
  // Display cutoff: priorityScore >= HOY_DISPLAY_CUTOFF (60) OR state === 'review'
  //   • Enforces "HOY is for action, not calendar reminders".
  //   • review items (score 65 after boost) always exceed the cutoff — explicit
  //     OR guard makes the intent clear.
  //
  // Anti-noise floor: priorityScore < HOY_ANTI_NOISE_MIN (10) → excluded.
  //
  // • 1 protagonist (top scorer, with anti-repetition)
  // • up to 2 secondaries (above display cutoff, excluding protagonist)
  // • reason key for contextual message
  // ───────────────────────────────────────────────────────────────────────────

  const isAboveCutoff = (sc: { priorityScore: number; state: string }): boolean =>
    sc.priorityScore >= HOY_DISPLAY_CUTOFF || sc.state === 'review';

  const ranked = scoredCandidates
    .filter(sc => sc.priorityScore >= HOY_ANTI_NOISE_MIN && isAboveCutoff(sc))
    .sort(sortCandidates);

  if (!ranked.length) return null;

  // Anti-repetition: if the top scorer matches last session's protagonist AND
  // a comparable alternative (within 15 pts ≈ one urgency band) exists, rotate.
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

  // Reason key — drives the contextual message shown below the protagonist name.
  const isFreshProtagonist = protagonist.productType === 'fresh';

  let reasonKey: string;
  if (isFreshProtagonist) {
    reasonKey = 'dashboard.today.reason.freshExpiring';
  } else if (protagonistState === 'review') {
    reasonKey = 'dashboard.today.reason.reviewExpiry';
  } else if (protagonistDays === null || protagonistDays <= 2) {
    reasonKey = 'dashboard.today.reason.expiringsoon'; // today (0) + 1-2 days
  } else if (protagonistDays <= 5) {
    reasonKey = 'dashboard.today.reason.expirestoday'; // 3-5 days
  } else {
    reasonKey = 'dashboard.today.reason.expiringlater'; // 6-10 days (action band)
  }

  // Secondaries: above display cutoff, excluding protagonist.
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
