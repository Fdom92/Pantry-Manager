import { sheetBackdropFactor } from './backdrop.util';

describe('sheetBackdropFactor', () => {
  it('a sheet at a breakpoint only brings that share of the full backdrop', () => {
    // Ionic scales the backdrop linearly with how far the sheet is open.
    expect(sheetBackdropFactor(0.45)).toBeCloseTo(0.45);
    expect(sheetBackdropFactor(0.85)).toBeCloseTo(0.85);
  });

  it('is the full backdrop when the sheet is fully open', () => {
    expect(sheetBackdropFactor(1)).toBe(1);
  });

  it('starts counting from the backdrop breakpoint', () => {
    expect(sheetBackdropFactor(0.5, 0.25)).toBeCloseTo(1 / 3);
    expect(sheetBackdropFactor(0.2, 0.25)).toBe(0);
  });

  it('has no backdrop at all when it only appears at a breakpoint of 1', () => {
    expect(sheetBackdropFactor(0.9, 1)).toBe(0);
  });

  it('stays within 0..1', () => {
    expect(sheetBackdropFactor(1.5)).toBe(1);
    expect(sheetBackdropFactor(-0.2)).toBe(0);
  });
});
