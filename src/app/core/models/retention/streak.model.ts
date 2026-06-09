import type { BaseDoc } from '../shared/base-doc.model';

export interface StreakState extends BaseDoc {
  readonly type: 'streak';
  readonly _id: 'streak:current';
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;      // ISO yyyy-mm-dd, local timezone
  graceUsedDate?: string;      // ISO yyyy-mm-dd of last grace day burn
  milestonesReached: number[]; // subset of [3, 7, 30, 100]
  startedAt: string;           // ISO timestamp of first ever streak entry
  updatedAt: string;
}
