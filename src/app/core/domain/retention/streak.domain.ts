import type { StreakState } from '@core/models/retention/streak.model';

export type StreakTransition =
  | { kind: 'incremented'; from: number; to: number }
  | { kind: 'grace_used'; streak: number; on: string }
  | { kind: 'reset'; previousStreak: number }
  | { kind: 'milestone_reached'; milestone: 3 | 7 | 30 | 100; streak: number };

export interface StreakEvaluation {
  next: StreakState;
  transitions: StreakTransition[];
}

export const STREAK_MILESTONES = [3, 7, 30, 100] as const;

export function isMilestone(streak: number): streak is 3 | 7 | 30 | 100 {
  return STREAK_MILESTONES.includes(streak as 3 | 7 | 30 | 100);
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
  transitions: StreakTransition[],
): number[] {
  if (isMilestone(streak) && !milestonesReached.includes(streak)) {
    transitions.push({ kind: 'milestone_reached', milestone: streak, streak });
    return [...milestonesReached, streak];
  }
  return milestonesReached;
}

function doIncrement(
  current: number,
  longest: number,
  lastActiveDate: string,
  today: string,
  milestonesReached: number[],
  transitions: StreakTransition[],
): { currentStreak: number; longestStreak: number; lastActiveDate: string; milestonesReached: number[] } {
  const from = current;
  const to = current + 1;
  transitions.push({ kind: 'incremented', from, to });
  const newLongest = Math.max(to, longest);
  const newMilestones = checkMilestone(to, milestonesReached, transitions);
  return { currentStreak: to, longestStreak: newLongest, lastActiveDate: today, milestonesReached: newMilestones };
}

/**
 * Pure function: given the current streak state and today's date, returns the
 * next state and a list of transitions that occurred.
 *
 * Rules:
 * - state === null && !triggeredByMutation → { next: null, transitions: [] }
 * - state === null && triggeredByMutation  → bootstrap streak=1
 * - lastActiveDate === today && mutation   → no-op
 * - gap=1                                 → increment
 * - gap=2, grace available, mutation      → burn grace + increment
 * - gap=2, grace unavailable OR !mutation → reset (+ increment if mutation)
 * - gap>=3                                → reset (+ increment if mutation)
 * - non-mutation with gap>=2              → reset to 0, no auto-increment
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
      startedAt: `${today}T00:00:00.000Z`,
    };
    transitions.push({ kind: 'incremented', from: 0, to: 1 });
    newState.milestonesReached = checkMilestone(1, newState.milestonesReached, transitions);
    return { next: newState, transitions };
  }

  if (state.lastActiveDate === today) {
    return { next: state, transitions: [] };
  }

  const gap = daysBetween(state.lastActiveDate, today);

  if (gap === 1) {
    const { currentStreak, longestStreak, lastActiveDate, milestonesReached } = doIncrement(
      state.currentStreak, state.longestStreak, state.lastActiveDate, today, state.milestonesReached, transitions,
    );
    return {
      next: { ...state, currentStreak, longestStreak, lastActiveDate, milestonesReached, updatedAt: now },
      transitions,
    };
  }

  if (gap === 2) {
    const graceAvailable =
      !state.graceUsedDate || daysBetween(state.graceUsedDate, today) >= 7;

    if (graceAvailable && triggeredByMutation) {
      const graceUsedDate = shiftDate(state.lastActiveDate, 1);
      transitions.push({ kind: 'grace_used', streak: state.currentStreak, on: graceUsedDate });
      const { currentStreak, longestStreak, lastActiveDate, milestonesReached } = doIncrement(
        state.currentStreak, state.longestStreak, state.lastActiveDate, today, state.milestonesReached, transitions,
      );
      return {
        next: { ...state, currentStreak, longestStreak, lastActiveDate, graceUsedDate, milestonesReached, updatedAt: now },
        transitions,
      };
    }
  }

  // gap >= 2 with no grace, or gap >= 3: reset
  const previousStreak = state.currentStreak;
  const longestStreak = Math.max(state.longestStreak, previousStreak);
  transitions.push({ kind: 'reset', previousStreak });
  let currentStreak = 0;
  let lastActiveDate = state.lastActiveDate;
  let milestonesReached = state.milestonesReached;

  if (triggeredByMutation) {
    const result = doIncrement(0, longestStreak, lastActiveDate, today, milestonesReached, transitions);
    currentStreak = result.currentStreak;
    lastActiveDate = result.lastActiveDate;
    milestonesReached = result.milestonesReached;
  }

  return {
    next: { ...state, currentStreak, longestStreak, lastActiveDate, milestonesReached, updatedAt: now },
    transitions,
  };
}
