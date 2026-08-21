import { SUPPORTED_LANGUAGES } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import { normalizeSearchQuery } from '@core/utils/normalization.util';
import { EXPIRY_SUGGESTION_DAYS } from './expiry-suggestion.domain';
import { FOOD_CONCEPTS } from './food-concepts.data';
import { inferExpiryForName, inferFoodType } from './food-type-inference.domain';

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

describe('FOOD_CONCEPTS data integrity', () => {
  it('has a unique key per concept', () => {
    const keys = FOOD_CONCEPTS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares at least one term for every supported language', () => {
    for (const concept of FOOD_CONCEPTS) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const terms = concept.terms[lang];
        expect(terms?.length)
          .withContext(`concept "${concept.key}" is missing terms for "${lang}"`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('stores every term already normalised (lowercase, unaccented)', () => {
    for (const concept of FOOD_CONCEPTS) {
      for (const terms of Object.values(concept.terms)) {
        for (const term of terms) {
          expect(term)
            .withContext(`concept "${concept.key}" has a non-normalised term`)
            .toBe(normalizeSearchQuery(term));
        }
      }
    }
  });

  it('resolves every declared term back to its own foodType', () => {
    // Guards against a term being silently shadowed by an earlier concept.
    // A shadowed term is allowed only if both concepts share the same foodType.
    for (const concept of FOOD_CONCEPTS) {
      for (const terms of Object.values(concept.terms)) {
        for (const term of terms) {
          expect(inferFoodType(term))
            .withContext(`term "${term}" (concept "${concept.key}") resolves elsewhere`)
            .toBe(concept.foodType);
        }
      }
    }
  });
});

describe('inferExpiryForName', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('returns the foodType and a suggested date for a known term', () => {
    const result = inferExpiryForName('leche', from);
    expect(result.foodType).toBe(FoodType.DAIRY);
    // DAIRY shelf life comes from the shared table, not a literal here
    const days = EXPIRY_SUGGESTION_DAYS[FoodType.DAIRY] as number;
    const expected = new Date(from);
    expected.setDate(expected.getDate() + days);
    const y = expected.getFullYear();
    const m = String(expected.getMonth() + 1).padStart(2, '0');
    const d = String(expected.getDate()).padStart(2, '0');
    expect(result.expirationDate).toBe(`${y}-${m}-${d}`);
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
