import { FoodType } from '@core/models/shared/enums.model';
import type { FoodClass } from './food-classes.model';
import { matchFoodClass, resolveFoodClass } from './food-class-resolution.domain';

const NONE = { es: [], en: [], de: [], fr: [], it: [], pt: [] };
const cls = (key: string, es: string[], extra: Partial<FoodClass> = {}): FoodClass => ({
  key, foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 1, openedDays: null, thawDays: null,
  source: 'test', terms: { ...NONE, es }, ...extra,
});

describe('matchFoodClass', () => {
  const classes = [
    cls('bread', ['pan']),
    cls('sausage', ['salchicha']),
    cls('yogurt', ['yogur']),
    cls('milk', ['leche']),
    cls('oat-milk', ['leche de avena']),
    cls('berry', ['fresa']),
    cls('shake', ['batido de fresa', 'strawberry milkshake'], { preparation: true }),
    cls('apple', ['manzana']),
    cls('pear', ['pera']),
    cls('fried-tomato', ['tomate frito']),
    cls('salt', ['sal']),
  ];
  const key = (name: string) => matchFoodClass(name, classes)?.key ?? null;

  it('matches whole words only', () => {
    expect(key('panceta')).toBeNull();
    expect(key('pan')).toBe('bread');
  });

  it('matches plurals', () => {
    expect(key('salchichas')).toBe('sausage');
    expect(key('yogures')).toBe('yogurt');
  });

  it('singularises every word of a phrase', () => {
    expect(key('tomates fritos')).toBe('fried-tomato');
  });

  it('does not fold words shorter than 4 letters', () => {
    expect(key('sal')).toBe('salt');
    expect(matchFoodClass('gas', [cls('ga', ['ga'])])).toBeNull();
  });

  it('longest term wins', () => {
    expect(key('leche de avena')).toBe('oat-milk');
  });

  it('preparation wins over its ingredient at equal length', () => {
    expect(key('batido de fresa')).toBe('shake');
    expect(key('strawberry milkshake')).toBe('shake');
  });

  it('ties between non-preparation classes go to the leftmost', () => {
    expect(key('pera manzana')).toBe('pear');
    expect(key('manzana pera')).toBe('apple');
  });

  it('uses the real table by default', () => {
    expect(matchFoodClass('leche')?.foodType).toBe(FoodType.DAIRY);
  });
});

describe('resolveFoodClass', () => {
  it('a stored foodType beats the name: corrected "Pan" as dairy is generic dairy', () => {
    expect(resolveFoodClass('Pan', FoodType.DAIRY)?.key).toBe('generic-dairy');
  });

  it('a stored foodKind wins', () => {
    expect(resolveFoodClass('x', undefined, 'fresh-bread')?.key).toBe('fresh-bread');
  });

  it('an unknown foodKind falls back to the name', () => {
    expect(resolveFoodClass('leche', undefined, 'nope')?.foodType).toBe(FoodType.DAIRY);
  });

  it('unknown name without type is null; with type it is the generic', () => {
    expect(resolveFoodClass('Kombucha')).toBeNull();
    expect(resolveFoodClass('Kombucha', FoodType.BEVERAGE)?.key).toBe('generic-beverage');
  });
});
