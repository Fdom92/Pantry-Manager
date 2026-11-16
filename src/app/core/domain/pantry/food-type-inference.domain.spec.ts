import { FoodType } from '@core/models/shared/enums.model';
import { suggestExpiryDate } from './expiry-suggestion.domain';
import { FOOD_CLASS_BY_KEY, genericClassFor } from './food-classes.data';
import { expiryAfterFoodTypeChange, inferExpiryForName, inferFoodType, resolveSuggestedExpiry } from './food-type-inference.domain';

describe('inferFoodType', () => {
  it('matches a simple single-word term', () => {
    expect(inferFoodType('leche')).toBe(FoodType.DAIRY);
  });

  it('is case-insensitive and diacritic-insensitive', () => {
    expect(inferFoodType('LECHE')).toBe(FoodType.DAIRY);
    expect(inferFoodType('Limón')).toBe(FoodType.FRUIT);
    expect(inferFoodType('limon')).toBe(FoodType.FRUIT);
  });

  it('finds the term inside a longer product name', () => {
    expect(inferFoodType('leche entera desnatada')).toBe(FoodType.DAIRY);
  });

  it('prefers the longest n-gram: "tomate frito" beats "tomate"', () => {
    expect(inferFoodType('tomate')).toBe(FoodType.VEGETABLE);
    expect(inferFoodType('tomate frito')).toBe(FoodType.NON_PERISHABLE);
    expect(inferFoodType('bote de tomate frito')).toBe(FoodType.NON_PERISHABLE);
  });

  it('reads drinks as beverages rather than falling through to OTHER', () => {
    expect(inferFoodType('agua')).toBe(FoodType.BEVERAGE);
    expect(inferFoodType('vino tinto')).toBe(FoodType.BEVERAGE);
    expect(inferFoodType('coca cola')).toBe(FoodType.BEVERAGE);
    expect(inferFoodType('fanta naranja')).toBe(FoodType.BEVERAGE);
  });

  it('reads store-cupboard staples and tins as non-perishable', () => {
    expect(inferFoodType('sal')).toBe(FoodType.NON_PERISHABLE);
    expect(inferFoodType('aceite de oliva')).toBe(FoodType.NON_PERISHABLE);
    expect(inferFoodType('atun')).toBe(FoodType.NON_PERISHABLE);
    expect(inferFoodType('lentejas')).toBe(FoodType.NON_PERISHABLE);
  });

  it('matches whole tokens only, never substrings', () => {
    // "pancarta" contains "pan" (bread) as a substring but is not a grocery
    expect(inferFoodType('pancarta')).toBeNull();
    // "limonada" contains "limon" but is a different product
    expect(inferFoodType('limonada')).toBeNull();
  });

  it('handles code-switching: english term with spanish app', () => {
    expect(inferFoodType('milk')).toBe(FoodType.DAIRY);
    expect(inferFoodType('yogurt')).toBe(FoodType.DAIRY);
  });

  it('returns null for unknown terms', () => {
    expect(inferFoodType('xyzzy')).toBeNull();
    expect(inferFoodType('')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(inferFoodType(null as unknown as string)).toBeNull();
    expect(inferFoodType(undefined as unknown as string)).toBeNull();
  });
});

describe('inferFoodType on a real household catalogue', () => {
  // Names from a real pantry (2026-11) that fell into "otros" or got no date.
  const cases: Array<[string, FoodType]> = [
    ['Pechuga de pollo congelada', FoodType.PROTEIN],
    ['Tilapia congelada', FoodType.PROTEIN],
    ['Contramuslos congelados', FoodType.PROTEIN],
    ['Alitas congeladas', FoodType.PROTEIN],
    ['Croquetas congeladas', FoodType.PROTEIN],
    ['Cachopo congelado', FoodType.PROTEIN],
    ['Lomos de pescado', FoodType.PROTEIN],
    ['Guisantes congelados', FoodType.VEGETABLE],
    ['Brócoli congelado', FoodType.VEGETABLE],
    // Portuguese has two everyday words for courgette; the catalogue only had the French one.
    ['Curgete', FoodType.VEGETABLE],
    ['Abobrinha', FoodType.VEGETABLE],
  ];
  for (const [name, type] of cases) {
    it(`reads "${name}" as ${type}`, () => {
      expect(inferFoodType(name)).toBe(type);
    });
  }
});

describe('inferExpiryForName', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('returns the foodType and a suggested date for a known term', () => {
    const result = inferExpiryForName('leche', from);
    expect(result.foodType).toBe(FoodType.DAIRY);
    expect(result.expirationDate).toBe(suggestExpiryDate(FOOD_CLASS_BY_KEY.get('uht-milk')!, from));
  });

  it('marks a never-expiring type as noExpiry instead of dating it', () => {
    const result = inferExpiryForName('bolsas de basura', from);
    expect(result.expirationDate).toBeUndefined();
    expect(result.noExpiry).toBe(true);
  });

  it('returns nulls for an unknown term so callers keep current behaviour', () => {
    const result = inferExpiryForName('xyzzy', from);
    expect(result.foodType).toBeNull();
    expect(result.expirationDate).toBeUndefined();
  });
});

describe('resolveSuggestedExpiry', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('prefers what this household learned for the product', () => {
    expect(resolveSuggestedExpiry('Huevos', FoodType.PROTEIN, from, { product: 10 }))
      .toEqual({ expirationDate: '2026-01-11', source: 'learned_product' });
  });

  it('dates a product the catalogue does not know, once learned', () => {
    expect(resolveSuggestedExpiry('Smileat cocidito', null, from, { product: 300 }).expirationDate).toBe('2026-10-28');
  });

  it('uses the class-level learning when the product has none', () => {
    expect(resolveSuggestedExpiry('Huevos', FoodType.PROTEIN, from, { klass: 6 }))
      .toEqual({ expirationDate: '2026-01-07', source: 'learned_class' });
  });

  it('prefers the product over the class', () => {
    expect(resolveSuggestedExpiry('Huevos', FoodType.PROTEIN, from, { product: 10, klass: 6 }).source).toBe('learned_product');
  });

  it('never dates a class that does not expire, even with learned days', () => {
    expect(resolveSuggestedExpiry('Bolsas de basura', FoodType.HOUSEHOLD, from, { product: 30 }))
      .toEqual({ noExpiry: true, source: 'none' });
    expect(resolveSuggestedExpiry('Sal', null, from, { product: 30 })).toEqual({ noExpiry: true, source: 'none' });
  });

  it('falls back to the class table when nothing was learned', () => {
    const eggs = FOOD_CLASS_BY_KEY.get('eggs')!;
    expect(resolveSuggestedExpiry('Huevos', FoodType.PROTEIN, from)).toEqual({
      expirationDate: suggestExpiryDate(eggs, from),
      source: 'table',
    });
  });

  it('suggests no date without a class or a type', () => {
    expect(resolveSuggestedExpiry('xyzzy', null, from)).toEqual({ source: 'none' });
  });

  it('dates fresh bread by its class, not by the 270 days of the carb type', () => {
    const bread = FOOD_CLASS_BY_KEY.get('fresh-bread')!;
    const result = resolveSuggestedExpiry('Pan', null, from);
    expect(result.expirationDate).toBe(suggestExpiryDate(bread, from));
    expect(result.expirationDate).toBe('2026-01-04');
  });

  it('a stored type wins over the name (corrected by hand)', () => {
    expect(resolveSuggestedExpiry('Pan', FoodType.DAIRY, from).expirationDate)
      .toBe(suggestExpiryDate(genericClassFor(FoodType.DAIRY), from));
  });
});

describe('expiryAfterFoodTypeChange', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('re-derives from the generic class of the new type', () => {
    expect(expiryAfterFoodTypeChange({}, FoodType.DAIRY, from))
      .toEqual({ expirationDate: suggestExpiryDate(genericClassFor(FoodType.DAIRY), from) });
    expect(expiryAfterFoodTypeChange({}, FoodType.HOUSEHOLD, from)).toEqual({ noExpiry: true });
  });

  it('keeps a date the user set', () => {
    expect(expiryAfterFoodTypeChange({ expirationDate: '2026-02-02', dateFromUser: true }, FoodType.DAIRY, from))
      .toEqual({ expirationDate: '2026-02-02', noExpiry: undefined });
  });
});
