import { daysUntilExpiry, toIsoDate } from './date.util';

describe('daysUntilExpiry', () => {
  const DAY_MS = 86_400_000;

  it('returns 1 for a date exactly 1 day from now', () => {
    const nowMs = Date.now();
    const tomorrow = new Date(nowMs + DAY_MS).toISOString().slice(0, 10);
    expect(daysUntilExpiry(tomorrow, nowMs)).toBe(1);
  });

  it('returns 7 for a date 7 days from now', () => {
    const nowMs = Date.now();
    const next = new Date(nowMs + 7 * DAY_MS).toISOString().slice(0, 10);
    expect(daysUntilExpiry(next, nowMs)).toBe(7);
  });

  it('returns negative for a past date', () => {
    const nowMs = Date.now();
    const yesterday = new Date(nowMs - DAY_MS).toISOString().slice(0, 10);
    expect(daysUntilExpiry(yesterday, nowMs)).toBeLessThan(0);
  });

  it('returns 0 or negative for today (depends on time of day vs UTC midnight)', () => {
    // "today" in ISO format parses as UTC midnight; result depends on local offset
    // but must be in range [-1, 1]
    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const d = daysUntilExpiry(today, nowMs);
    expect(d).toBeGreaterThanOrEqual(-1);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('uses Math.ceil so fractional days round up', () => {
    // 0.5 days in the future → ceil → 1
    const nowMs = 1000;
    const halfDayAheadMs = nowMs + DAY_MS / 2;
    const dateStr = new Date(halfDayAheadMs).toISOString();
    expect(daysUntilExpiry(dateStr, nowMs)).toBe(1);
  });

  it('uses current time when nowMs not provided', () => {
    const future = new Date(Date.now() + 2 * DAY_MS).toISOString().slice(0, 10);
    const result = daysUntilExpiry(future);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(3);
  });
});

describe('toIsoDate', () => {
  it('returns ISO string for valid date input', () => {
    const result = toIsoDate('2026-05-28');
    expect(result).not.toBeNull();
    expect(result!.startsWith('2026-05-28')).toBeTrue();
  });

  it('returns null for empty string', () => {
    expect(toIsoDate('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(toIsoDate('not-a-date')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(toIsoDate('   ')).toBeNull();
  });
});
