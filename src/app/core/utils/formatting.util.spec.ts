import { roundQuantity, toNumberOrZero } from './formatting.util';

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
