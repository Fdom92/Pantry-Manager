import { formatDisplayDate, formatDuration, formatRelativeDays, toDisplayDuration } from './date-display.domain';

describe('toDisplayDuration', () => {
  it('keeps days up to 13, where urgency matters', () => {
    expect(toDisplayDuration(1)).toEqual({ value: 1, unit: 'day' });
    expect(toDisplayDuration(10)).toEqual({ value: 10, unit: 'day' });
    expect(toDisplayDuration(13)).toEqual({ value: 13, unit: 'day' });
  });

  it('switches to weeks from 14 to 59 days', () => {
    expect(toDisplayDuration(14)).toEqual({ value: 2, unit: 'week' });
    expect(toDisplayDuration(20)).toEqual({ value: 3, unit: 'week' });
    expect(toDisplayDuration(59)).toEqual({ value: 8, unit: 'week' });
  });

  it('switches to months from 60 days', () => {
    expect(toDisplayDuration(60)).toEqual({ value: 2, unit: 'month' });
    expect(toDisplayDuration(270)).toEqual({ value: 9, unit: 'month' });
  });

  it('switches to years once the months round to 12', () => {
    expect(toDisplayDuration(320)).toEqual({ value: 11, unit: 'month' });
    expect(toDisplayDuration(360)).toEqual({ value: 1, unit: 'year' });
    expect(toDisplayDuration(400)).toEqual({ value: 1, unit: 'year' });
    expect(toDisplayDuration(800)).toEqual({ value: 2, unit: 'year' });
  });

  it('uses the magnitude: the caller owns past vs future', () => {
    expect(toDisplayDuration(-270)).toEqual({ value: 9, unit: 'month' });
    expect(toDisplayDuration(-3)).toEqual({ value: 3, unit: 'day' });
  });

  it('treats 0 and invalid input as 0 days', () => {
    expect(toDisplayDuration(0)).toEqual({ value: 0, unit: 'day' });
    expect(toDisplayDuration(Number.NaN)).toEqual({ value: 0, unit: 'day' });
  });
});

describe('formatDuration', () => {
  it('prints the unit in the locale, plural included', () => {
    expect(formatDuration(270, 'es-ES')).toBe('9 meses');
    expect(formatDuration(1, 'es-ES')).toBe('1 día');
    expect(formatDuration(20, 'en-US')).toBe('3 weeks');
    expect(formatDuration(270, 'de-DE')).toBe('9 Monate');
  });
});

describe('formatRelativeDays', () => {
  it('uses words for today, tomorrow and yesterday', () => {
    expect(formatRelativeDays(0, 'es-ES')).toBe('hoy');
    expect(formatRelativeDays(1, 'es-ES')).toBe('mañana');
    expect(formatRelativeDays(-1, 'es-ES')).toBe('ayer');
  });

  it('uses numbers beyond one day, never "pasado mañana" or "el próximo año"', () => {
    expect(formatRelativeDays(2, 'es-ES')).toBe('dentro de 2 días');
    expect(formatRelativeDays(-2, 'es-ES')).toBe('hace 2 días');
    expect(formatRelativeDays(400, 'es-ES')).toBe('dentro de 1 año');
  });

  it('keeps each language grammar (German dative)', () => {
    expect(formatRelativeDays(270, 'es-ES')).toBe('dentro de 9 meses');
    expect(formatRelativeDays(270, 'de-DE')).toBe('in 9 Monaten');
    expect(formatRelativeDays(-3, 'it-IT')).toBe('3 giorni fa');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeDays(Number.NaN, 'es-ES')).toBe('');
  });
});

describe('formatDisplayDate', () => {
  it('formats a stored YYYY-MM-DD in local time and the given locale', () => {
    expect(formatDisplayDate('2026-07-05', 'es-ES', 'dayMonth')).toBe('5 jul');
    expect(formatDisplayDate('2026-07-05', 'es-ES', 'long')).toBe('5 de julio de 2026');
    expect(formatDisplayDate('2026-07-05', 'en-US', 'short')).toBe('Jul 5, 2026');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatDisplayDate('not a date', 'es-ES')).toBe('');
    expect(formatDisplayDate(null, 'es-ES')).toBe('');
  });
});
