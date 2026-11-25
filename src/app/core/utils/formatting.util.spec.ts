import { formatQuantity, roundQuantity, toNumberOrZero } from './formatting.util';

describe('toNumberOrZero', () => {
  it('converts valid number string to number', () => {
    expect(toNumberOrZero('3')).toBe(3);
    expect(toNumberOrZero('1.5')).toBe(1.5);
  });

  it('converts numeric value to number', () => {
    expect(toNumberOrZero(42)).toBe(42);
    expect(toNumberOrZero(0)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(toNumberOrZero(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(toNumberOrZero(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(toNumberOrZero('abc')).toBe(0);
    expect(toNumberOrZero('')).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(toNumberOrZero(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(toNumberOrZero(Infinity)).toBe(0);
    expect(toNumberOrZero(-Infinity)).toBe(0);
  });

  it('preserves negative numbers', () => {
    expect(toNumberOrZero(-5)).toBe(-5);
  });
});

describe('roundQuantity', () => {
  it('rounds to nearest integer', () => {
    expect(roundQuantity(1.4)).toBe(1);
    expect(roundQuantity(1.5)).toBe(2);
    expect(roundQuantity(2.6)).toBe(3);
  });

  it('returns 0 for null', () => {
    expect(roundQuantity(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(roundQuantity(undefined)).toBe(0);
  });

  it('handles already-integer values', () => {
    expect(roundQuantity(3)).toBe(3);
    expect(roundQuantity(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(roundQuantity(-1.4)).toBe(-1);
    expect(roundQuantity(-1.5)).toBe(-1);
  });
});

describe('formatQuantity', () => {
  it('formats a rounded quantity in the locale', () => {
    expect(formatQuantity(1234.4, 'es-ES')).toBe('1234');
    expect(formatQuantity(1234.4, 'en-US')).toBe('1,234');
  });

  it('reuses one Intl.NumberFormat per locale', () => {
    const Orig = Intl.NumberFormat;
    let built = 0;
    (Intl as unknown as Record<string, unknown>)['NumberFormat'] = class extends Orig {
      constructor(...args: ConstructorParameters<typeof Intl.NumberFormat>) {
        super(...args);
        built++;
      }
    };
    try {
      for (let i = 0; i < 3; i++) formatQuantity(i, 'it-IT');
      expect(built).toBeLessThanOrEqual(1);
    } finally {
      (Intl as unknown as Record<string, unknown>)['NumberFormat'] = Orig;
    }
  });
});
