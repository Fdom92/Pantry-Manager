import { FoodType } from '@core/models/shared';
import { inferFoodType } from '@core/domain/pantry/food-type-inference.domain';
import es from '../../../../assets/i18n/es.json';
import { ONBOARDING_QUICK_SEED_ITEMS } from './quick-seed.constants';

/**
 * The onboarding seeds carry an explicit foodType, and the inference dictionary
 * carries one for the same products under their names. Two sources for the same
 * fact drift silently: sugar sat as a carbohydrate in the dictionary while the
 * seed called it non-perishable, and nothing caught it but a reading of the
 * table. These tests are the thing that catches it.
 */
describe('onboarding quick seed — agrees with the inference dictionary', () => {
  const labels = (es as { onboarding: { quickSeed: { items: Record<string, string> } } })
    .onboarding.quickSeed.items;

  it('gives every seed a Spanish label', () => {
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      expect(labels[seed.key]).withContext(`missing label for ${seed.key}`).toBeTruthy();
    }
  });

  it('never contradicts the type the dictionary infers from the seed name', () => {
    const clashes: string[] = [];
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      const inferred = inferFoodType(labels[seed.key] ?? '');
      // A seed whose name is not in the dictionary is fine — the seed's own type
      // stands. Only an actual disagreement is a problem.
      if (inferred !== null && inferred !== seed.foodType) {
        clashes.push(`${seed.key}: seed=${seed.foodType} dictionary=${inferred}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('only seeds types that exist in the enum', () => {
    const known = Object.values(FoodType);
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      expect(known).toContain(seed.foodType);
    }
  });
});
