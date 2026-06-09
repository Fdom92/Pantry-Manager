import type { StreakState } from '@core/models/retention/streak.model';
import { evaluateStreak } from './streak.domain';

const TODAY = '2026-06-09';
const YESTERDAY = '2026-06-08';
const TWO_DAYS_AGO = '2026-06-07';
const THREE_DAYS_AGO = '2026-06-06';
const EIGHT_DAYS_AGO = '2026-06-01';

function makeState(overrides: Partial<StreakState> = {}): StreakState {
  return {
    _id: 'streak:current',
    type: 'streak',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentStreak: 1,
    longestStreak: 1,
    lastActiveDate: YESTERDAY,
    milestonesReached: [],
    startedAt: '2026-06-08T00:00:00.000Z',
    ...overrides,
  } as StreakState;
}

// ── 1. null state + mutation → bootstrap streak=1, emit incremented ──────────
describe('evaluateStreak — null state', () => {
  it('bootstraps streak=1 on first mutation', () => {
    const { next, transitions } = evaluateStreak(null, TODAY, true);
    expect(next).not.toBeNull();
    expect(next!.currentStreak).toBe(1);
    expect(next!.longestStreak).toBe(1);
    expect(next!.lastActiveDate).toBe(TODAY);
    expect(transitions).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({ kind: 'incremented', from: 0, to: 1 }),
    ]));
  });

  // 2. null state + no mutation → no-op (next is null)
  it('returns null next on bootstrap without mutation', () => {
    const { next, transitions } = evaluateStreak(null, TODAY, false);
    expect(next).toBeNull();
    expect(transitions).toEqual([]);
  });
});

// ── 3. same-day mutation → no-op ──────────────────────────────────────────────
describe('evaluateStreak — same-day', () => {
  it('returns unchanged state when lastActiveDate === today', () => {
    const state = makeState({ lastActiveDate: TODAY });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next).toBe(state);
    expect(transitions).toEqual([]);
  });
});

// ── 4. gap=1 → increment ──────────────────────────────────────────────────────
describe('evaluateStreak — gap=1', () => {
  it('increments streak by 1 when gap is exactly 1 day', () => {
    const state = makeState({ currentStreak: 2, longestStreak: 2, lastActiveDate: YESTERDAY });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(3);
    expect(transitions.some(t => t.kind === 'incremented')).toBeTrue();
  });

  it('updates longestStreak when currentStreak surpasses it', () => {
    const state = makeState({ currentStreak: 5, longestStreak: 5, lastActiveDate: YESTERDAY });
    const { next } = evaluateStreak(state, TODAY, true);
    expect(next!.longestStreak).toBe(6);
  });
});

// ── 5. gap=2 with no prior grace → burn grace + increment ────────────────────
describe('evaluateStreak — gap=2, grace available', () => {
  it('uses grace day and increments streak when no prior grace', () => {
    const state = makeState({ currentStreak: 3, longestStreak: 3, lastActiveDate: TWO_DAYS_AGO });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(4);
    expect(next!.graceUsedDate).toBeDefined();
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
    expect(transitions.some(t => t.kind === 'incremented')).toBeTrue();
  });
});

// ── 6. gap=2 with grace burned within last 7 days → reset ────────────────────
describe('evaluateStreak — gap=2, grace exhausted', () => {
  it('resets when grace was burned less than 7 days ago', () => {
    const state = makeState({
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: TWO_DAYS_AGO,
      graceUsedDate: YESTERDAY, // within 7 days
    });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(transitions.some(t => t.kind === 'reset')).toBeTrue();
  });
});

// ── 7. gap=2 with grace burned 8+ days ago → grace available again ────────────
describe('evaluateStreak — gap=2, grace replenished', () => {
  it('uses grace again when last grace burn was 8+ days ago', () => {
    const state = makeState({
      currentStreak: 5,
      longestStreak: 5,
      lastActiveDate: TWO_DAYS_AGO,
      graceUsedDate: EIGHT_DAYS_AGO,
    });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(6);
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
    expect(transitions.some(t => t.kind === 'incremented')).toBeTrue();
  });
});

// ── 8. gap=3 → reset; mutation increments to 1 ───────────────────────────────
describe('evaluateStreak — gap>=3', () => {
  it('resets on gap=3 and immediately increments to 1 with mutation', () => {
    const state = makeState({ currentStreak: 5, longestStreak: 5, lastActiveDate: THREE_DAYS_AGO });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(1);
    expect(next!.lastActiveDate).toBe(TODAY);
    const reset = transitions.find(t => t.kind === 'reset') as any;
    expect(reset).toBeDefined();
    expect(reset.previousStreak).toBe(5);
  });
});

// ── 9. crossing milestone 3 → milestone_reached emitted once ─────────────────
describe('evaluateStreak — milestones', () => {
  it('emits milestone_reached when streak hits 3', () => {
    const state = makeState({ currentStreak: 2, longestStreak: 2, lastActiveDate: YESTERDAY, milestonesReached: [] });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.milestonesReached).toContain(3);
    const milestone = transitions.find(t => t.kind === 'milestone_reached') as any;
    expect(milestone).toBeDefined();
    expect(milestone.milestone).toBe(3);
  });

  // 10. milestone already in milestonesReached → no re-fire
  it('does not re-emit milestone already reached', () => {
    const state = makeState({ currentStreak: 2, longestStreak: 3, lastActiveDate: YESTERDAY, milestonesReached: [3] });
    const { transitions } = evaluateStreak(state, TODAY, true);
    expect(transitions.some(t => t.kind === 'milestone_reached')).toBeFalse();
  });
});

// ── 11. reset updates longestStreak before zeroing currentStreak ──────────────
describe('evaluateStreak — longestStreak on reset', () => {
  it('preserves longestStreak when currentStreak was already lower', () => {
    const state = makeState({ currentStreak: 3, longestStreak: 10, lastActiveDate: THREE_DAYS_AGO });
    const { next } = evaluateStreak(state, TODAY, false);
    expect(next!.longestStreak).toBe(10);
    expect(next!.currentStreak).toBe(0);
  });

  it('updates longestStreak when currentStreak was higher', () => {
    const state = makeState({ currentStreak: 15, longestStreak: 10, lastActiveDate: THREE_DAYS_AGO });
    const { next } = evaluateStreak(state, TODAY, false);
    expect(next!.longestStreak).toBe(15);
    expect(next!.currentStreak).toBe(0);
  });
});

// ── 12. non-mutation bootstrap on gap >= 2 → reset to 0, no auto-increment ───
describe('evaluateStreak — non-mutation bootstrap with gap>=2', () => {
  it('resets to 0 without auto-incrementing when not triggered by mutation', () => {
    const state = makeState({ currentStreak: 5, longestStreak: 5, lastActiveDate: TWO_DAYS_AGO });
    const { next, transitions } = evaluateStreak(state, TODAY, false);
    expect(next!.currentStreak).toBe(0);
    expect(transitions.some(t => t.kind === 'reset')).toBeTrue();
    expect(transitions.some(t => t.kind === 'incremented')).toBeFalse();
  });
});
