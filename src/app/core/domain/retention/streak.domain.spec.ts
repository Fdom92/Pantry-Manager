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
    expect(next!.graceTokens).toBe(1);
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

// ── 5. gap=2 with a token in the wallet → burn token + increment ─────────────
describe('evaluateStreak — gap=2, token available', () => {
  it('burns a grace token and increments the streak', () => {
    const state = makeState({ currentStreak: 4, longestStreak: 4, lastActiveDate: TWO_DAYS_AGO, graceTokens: 1 });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(5);
    expect(next!.graceTokens).toBe(0);
    expect(next!.graceUsedDate).toBeDefined();
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
    expect(transitions.some(t => t.kind === 'incremented')).toBeTrue();
  });

  it('treats legacy docs without graceTokens as having the initial token', () => {
    const state = makeState({ currentStreak: 3, longestStreak: 3, lastActiveDate: TWO_DAYS_AGO });
    delete (state as { graceTokens?: number }).graceTokens;
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(4);
    expect(next!.graceTokens).toBe(0);
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
  });

  it('ignores graceUsedDate recency — only the wallet matters', () => {
    const state = makeState({
      currentStreak: 5,
      longestStreak: 5,
      lastActiveDate: TWO_DAYS_AGO,
      graceUsedDate: EIGHT_DAYS_AGO,
      graceTokens: 1,
    });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(6);
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
  });
});

// ── 6. gap=2 with an empty wallet → reset (no time-based regeneration) ───────
describe('evaluateStreak — gap=2, no tokens', () => {
  it('resets when the wallet is empty', () => {
    const state = makeState({
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: TWO_DAYS_AGO,
      graceTokens: 0,
    });
    const { transitions } = evaluateStreak(state, TODAY, true);
    expect(transitions.some(t => t.kind === 'reset')).toBeTrue();
    expect(transitions.some(t => t.kind === 'grace_used')).toBeFalse();
  });

  it('does not regenerate by time: empty wallet resets even if last burn was 8+ days ago', () => {
    const state = makeState({
      currentStreak: 5,
      longestStreak: 5,
      lastActiveDate: TWO_DAYS_AGO,
      graceUsedDate: EIGHT_DAYS_AGO,
      graceTokens: 0,
    });
    const { transitions } = evaluateStreak(state, TODAY, true);
    expect(transitions.some(t => t.kind === 'reset')).toBeTrue();
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

  it('emits milestone_reached at the new 14-day milestone', () => {
    const state = makeState({ currentStreak: 13, longestStreak: 13, lastActiveDate: YESTERDAY, milestonesReached: [3, 7] });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.milestonesReached).toContain(14);
    const milestone = transitions.find(t => t.kind === 'milestone_reached') as any;
    expect(milestone.milestone).toBe(14);
  });

  it('no longer treats 100 as a milestone', () => {
    const state = makeState({ currentStreak: 99, longestStreak: 99, lastActiveDate: YESTERDAY, milestonesReached: [3, 7, 14, 30] });
    const { transitions } = evaluateStreak(state, TODAY, true);
    expect(transitions.some(t => t.kind === 'milestone_reached')).toBeFalse();
  });
});

// ── Reward: milestones grant grace tokens ─────────────────────────────────────
describe('evaluateStreak — grace token rewards', () => {
  it('grants +1 token when a milestone is reached', () => {
    const state = makeState({ currentStreak: 2, longestStreak: 2, lastActiveDate: YESTERDAY, milestonesReached: [], graceTokens: 1 });
    const { next } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(3);
    expect(next!.graceTokens).toBe(2);
  });

  it('caps the wallet at the maximum', () => {
    const state = makeState({ currentStreak: 6, longestStreak: 6, lastActiveDate: YESTERDAY, milestonesReached: [3], graceTokens: 3 });
    const { next } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(7);
    expect(next!.graceTokens).toBe(3);
  });

  it('re-grants the token in the same evaluation that burns it when a milestone lands', () => {
    // gap=2 burns the only token; the increment lands on milestone 3 → wallet back to 1
    const state = makeState({ currentStreak: 2, longestStreak: 2, lastActiveDate: TWO_DAYS_AGO, milestonesReached: [], graceTokens: 1 });
    const { next, transitions } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(3);
    expect(next!.graceTokens).toBe(1);
    expect(transitions.some(t => t.kind === 'grace_used')).toBeTrue();
    expect(transitions.some(t => t.kind === 'milestone_reached')).toBeTrue();
  });

  it('preserves the wallet across resets', () => {
    const state = makeState({ currentStreak: 5, longestStreak: 5, lastActiveDate: THREE_DAYS_AGO, graceTokens: 2 });
    const { next } = evaluateStreak(state, TODAY, true);
    expect(next!.currentStreak).toBe(1);
    expect(next!.graceTokens).toBe(2);
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
