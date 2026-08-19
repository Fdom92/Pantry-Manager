import { FoodType } from '@core/models/shared/enums.model';
import { inferFoodType } from './food-type-inference.domain';

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
    expect(inferFoodType('tomate frito')).toBe(FoodType.CARB);
    expect(inferFoodType('bote de tomate frito')).toBe(FoodType.CARB);
  });

  it('matches whole tokens only, never substrings', () => {
    // "panceta" contains "pan" (bread) but is pork
    expect(inferFoodType('panceta')).toBeNull();
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
