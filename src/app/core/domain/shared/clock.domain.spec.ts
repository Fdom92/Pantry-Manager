import { isSameLocalDay, msUntilNextLocalMidnight } from './clock.domain';

describe('msUntilNextLocalMidnight', () => {
  it('counts to the next local midnight', () => {
    const now = new Date(2026, 8, 22, 23, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(60 * 60 * 1000);
  });

  it('is a full day right at midnight', () => {
    const now = new Date(2026, 8, 22, 0, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isSameLocalDay', () => {
  it('compares calendar days in local time', () => {
    expect(isSameLocalDay(new Date(2026, 8, 22, 0, 1).getTime(), new Date(2026, 8, 22, 23, 59).getTime())).toBeTrue();
    expect(isSameLocalDay(new Date(2026, 8, 22, 23, 59).getTime(), new Date(2026, 8, 23, 0, 1).getTime())).toBeFalse();
  });
});
