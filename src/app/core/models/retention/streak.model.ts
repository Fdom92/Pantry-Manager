import type { BaseDoc } from '../shared/base-doc.model';

export interface StreakState extends BaseDoc {
  readonly type: 'streak';
  readonly _id: 'streak:current';
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;      // ISO yyyy-mm-dd, local timezone
  graceUsedDate?: string;      // ISO yyyy-mm-dd of last grace day burn
  graceTokens?: number;        // grace-day wallet; absent on legacy docs (defaults to 1)
  milestonesReached: number[]; // subset of STREAK_MILESTONES (legacy docs may hold 100)
  startedAt: string;           // ISO timestamp of first ever streak entry
  updatedAt: string;
}
