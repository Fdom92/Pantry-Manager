import { dimColor, isLightColor, parseCssColor, toHex } from './color.util';

describe('parseCssColor', () => {
  it('reads the rgb() and rgba() strings getComputedStyle returns', () => {
    expect(parseCssColor('rgb(30, 30, 30)')).toEqual({ r: 30, g: 30, b: 30 });
    expect(parseCssColor('rgba(246, 250, 248, 1)')).toEqual({ r: 246, g: 250, b: 248 });
    expect(parseCssColor('rgb(18 18 18)')).toEqual({ r: 18, g: 18, b: 18 });
  });

  it('reads #rgb and #rrggbb', () => {
    expect(parseCssColor('#1e1e1e')).toEqual({ r: 30, g: 30, b: 30 });
    expect(parseCssColor('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('reads color(srgb ...) with 0..1 channels', () => {
    expect(parseCssColor('color(srgb 1 0.5 0)')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('returns null for what it cannot read, and for fully transparent colours', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('var(--nope)')).toBeNull();
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toBeNull();
  });
});

describe('toHex', () => {
  it('pads and upper-cases', () => {
    expect(toHex({ r: 0, g: 10, b: 255 })).toBe('#000AFF');
  });
});

describe('dimColor', () => {
  it('mixes with black by the backdrop opacity', () => {
    expect(dimColor({ r: 200, g: 100, b: 0 }, 0.5)).toEqual({ r: 100, g: 50, b: 0 });
  });

  it('leaves the colour alone at 0 and goes black at 1', () => {
    expect(dimColor({ r: 30, g: 40, b: 50 }, 0)).toEqual({ r: 30, g: 40, b: 50 });
    expect(dimColor({ r: 30, g: 40, b: 50 }, 1)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('clamps an out-of-range opacity', () => {
    expect(dimColor({ r: 100, g: 100, b: 100 }, 2)).toEqual({ r: 0, g: 0, b: 0 });
    expect(dimColor({ r: 100, g: 100, b: 100 }, -1)).toEqual({ r: 100, g: 100, b: 100 });
  });
});

describe('isLightColor', () => {
  it('tells the app light and dark toolbars apart', () => {
    expect(isLightColor({ r: 255, g: 255, b: 255 })).toBeTrue();
    expect(isLightColor({ r: 246, g: 250, b: 248 })).toBeTrue();
    expect(isLightColor({ r: 30, g: 30, b: 30 })).toBeFalse();
    expect(isLightColor({ r: 18, g: 18, b: 18 })).toBeFalse();
  });
});
