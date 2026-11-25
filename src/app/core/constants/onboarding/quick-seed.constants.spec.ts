import { inferFoodType } from '@core/domain/pantry/food-type-inference.domain';
import { FOOD_CLASS_BY_KEY } from '@core/domain/pantry/food-classes.data';
import es from '../../../../assets/i18n/es.json';
import { ONBOARDING_QUICK_SEED_ITEMS } from './quick-seed.constants';

/**
 * Each basic carries a food class, which is the one source for its type, date
 * and pantry/fresh. The dictionary also infers a type from the name; two
 * sources for one fact drift silently, so these tests catch the disagreement.
 */
describe('onboarding quick seed — points at food classes', () => {
  const labels = (es as { onboarding: { quickSeed: { items: Record<string, string> } } })
    .onboarding.quickSeed.items;

  it('gives every seed a Spanish label', () => {
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      expect(labels[seed.key]).withContext(`missing label for ${seed.key}`).toBeTruthy();
    }
  });

  it('points every seed at an existing food class', () => {
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      expect(FOOD_CLASS_BY_KEY.has(seed.classKey)).withContext(`${seed.key} -> ${seed.classKey}`).toBeTrue();
    }
  });

  it('never contradicts the type the dictionary infers from the seed name', () => {
    const clashes: string[] = [];
    for (const seed of ONBOARDING_QUICK_SEED_ITEMS) {
      const inferred = inferFoodType(labels[seed.key] ?? '');
      const classType = FOOD_CLASS_BY_KEY.get(seed.classKey)?.foodType;
      if (inferred !== null && inferred !== classType) {
        clashes.push(`${seed.key}: class=${classType} dictionary=${inferred}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps salt, pepper, sugar and vinegar on a class that never expires', () => {
    for (const key of ['salt', 'pepper', 'sugar', 'vinegar']) {
      const seed = ONBOARDING_QUICK_SEED_ITEMS.find(s => s.key === key)!;
      expect(FOOD_CLASS_BY_KEY.get(seed.classKey)?.sealedDays).withContext(key).toBeNull();
    }
  });
});
