import type { StreakState } from '@core/models/retention/streak.model';

export const STREAK_MILESTONES = [3, 7, 14, 30] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/**
 * Grace-day wallet ("comodines"): every streak starts with one token; each
 * milestone earns one more (capped). Burning a token forgives a single
 * missed day (gap of exactly 2). There is no time-based regeneration —
 * tokens are only earned back through milestones.
 */
export const GRACE_TOKENS_INITIAL = 1;
export const GRACE_TOKENS_MAX = 3;

export type StreakTransition =
  | { kind: 'incremented'; from: number; to: number }
  | { kind: 'grace_used'; streak: number; on: string }
  | { kind: 'reset'; previousStreak: number }
  | { kind: 'milestone_reached'; milestone: StreakMilestone; streak: number };

export interface StreakEvaluation {
  next: StreakState;
  transitions: StreakTransition[];
}

export function isMilestone(streak: number): streak is StreakMilestone {
  return STREAK_MILESTONES.includes(streak as StreakMilestone);
}

/** Legacy docs predate the wallet — they default to the initial token. */
function tokensOf(state: StreakState): number {
  return state.graceTokens ?? GRACE_TOKENS_INITIAL;
}

/**
 * Returns floor(days) between two ISO yyyy-mm-dd strings.
 * Positive when b is after a.
 */
function daysBetween(a: string, b: string): number {
  const msA = new Date(`${a}T00:00:00`).getTime();
  const msB = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(msA) || Number.isNaN(msB)) return 0;
  return Math.floor((msB - msA) / 86_400_000);
}

/**
 * Returns today's ISO yyyy-mm-dd string shifted by `days` days.
 * Used to derive the grace day date (lastActiveDate + 1).
 */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function checkMilestone(
  streak: number,
  milestonesReached: number[],
  graceTokens: number,
  transitions: StreakTransition[],
): { milestonesReached: number[]; graceTokens: number } {
  if (isMilestone(streak) && !milestonesReached.includes(streak)) {
    transitions.push({ kind: 'milestone_reached', milestone: streak, streak });
    return {
      milestonesReached: [...milestonesReached, streak],
      graceTokens: Math.min(GRACE_TOKENS_MAX, graceTokens + 1),
    };
  }
  return { milestonesReached, graceTokens };
}

function doIncrement(
  current: number,
  longest: number,
  today: string,
  milestonesReached: number[],
  graceTokens: number,
  transitions: StreakTransition[],
): {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  milestonesReached: number[];
  graceTokens: number;
} {
  const from = current;
  const to = current + 1;
  transitions.push({ kind: 'incremented', from, to });
  const newLongest = Math.max(to, longest);
  const milestone = checkMilestone(to, milestonesReached, graceTokens, transitions);
  return {
    currentStreak: to,
    longestStreak: newLongest,
    lastActiveDate: today,
    milestonesReached: milestone.milestonesReached,
    graceTokens: milestone.graceTokens,
  };
}

/**
 * Pure function: given the current streak state and today's date, returns the
 * next state and a list of transitions that occurred.
 *
 * Rules:
 * - state === null && !triggeredByMutation → { next: null, transitions: [] }
 * - state === null && triggeredByMutation  → bootstrap streak=1, 1 grace token
 * - lastActiveDate === today && mutation   → no-op
 * - gap=1                                  → increment
 * - gap=2, token available, mutation       → burn token + increment
 * - gap=2, no tokens OR !mutation          → reset (+ increment if mutation)
 * - gap>=3                                 → reset (+ increment if mutation)
 * - non-mutation with gap>=2               → reset to 0, no auto-increment
 * - each milestone reached earns +1 grace token (cap GRACE_TOKENS_MAX)
 */
export function evaluateStreak(
  state: StreakState | null,
  today: string,
  triggeredByMutation: boolean,
): StreakEvaluation {
  const now = new Date().toISOString();
  const transitions: StreakTransition[] = [];

  if (state === null) {
    if (!triggeredByMutation) {
      return { next: null as unknown as StreakState, transitions: [] };
    }
    const newState: StreakState = {
      _id: 'streak:current',
      type: 'streak',
      createdAt: now,
      updatedAt: now,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: today,
      milestonesReached: [],
      graceTokens: GRACE_TOKENS_INITIAL,
      startedAt: `${today}T00:00:00.000Z`,
    };
    transitions.push({ kind: 'incremented', from: 0, to: 1 });
    const milestone = checkMilestone(1, newState.milestonesReached, GRACE_TOKENS_INITIAL, transitions);
    newState.milestonesReached = milestone.milestonesReached;
    newState.graceTokens = milestone.graceTokens;
    return { next: newState, transitions };
  }

  if (state.lastActiveDate === today) {
    return { next: state, transitions: [] };
  }

  const gap = daysBetween(state.lastActiveDate, today);
  const tokens = tokensOf(state);

  if (gap === 1) {
    const inc = doIncrement(
      state.currentStreak, state.longestStreak, today, state.milestonesReached, tokens, transitions,
    );
    return { next: { ...state, ...inc, updatedAt: now }, transitions };
  }

  if (gap === 2 && tokens > 0 && triggeredByMutation) {
    const graceUsedDate = shiftDate(state.lastActiveDate, 1);
    transitions.push({ kind: 'grace_used', streak: state.currentStreak, on: graceUsedDate });
    const inc = doIncrement(
      state.currentStreak, state.longestStreak, today, state.milestonesReached, tokens - 1, transitions,
    );
    return { next: { ...state, ...inc, graceUsedDate, updatedAt: now }, transitions };
  }

  // gap >= 2 with no tokens, or gap >= 3: reset (tokens persist across resets)
  const previousStreak = state.currentStreak;
  const longestStreak = Math.max(state.longestStreak, previousStreak);
  transitions.push({ kind: 'reset', previousStreak });
  let currentStreak = 0;
  let lastActiveDate = state.lastActiveDate;
  let milestonesReached = state.milestonesReached;
  let graceTokens = tokens;

  if (triggeredByMutation) {
    const inc = doIncrement(0, longestStreak, today, milestonesReached, tokens, transitions);
    currentStreak = inc.currentStreak;
    lastActiveDate = inc.lastActiveDate;
    milestonesReached = inc.milestonesReached;
    graceTokens = inc.graceTokens;
  }

  return {
    next: { ...state, currentStreak, longestStreak, lastActiveDate, milestonesReached, graceTokens, updatedAt: now },
    transitions,
  };
}
