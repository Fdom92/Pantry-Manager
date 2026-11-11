import { SUPPORTED_LANGUAGES } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import { normalizeForClassification } from '@core/utils/normalization.util';
import { FOOD_CLASSES, FOOD_CLASS_BY_KEY, genericClassFor } from './food-classes.data';

const isGeneric = (key: string) => key.startsWith('generic-');

describe('FOOD_CLASSES integrity', () => {
  it('has unique keys', () => {
    expect(new Set(FOOD_CLASSES.map((c) => c.key)).size).toBe(FOOD_CLASSES.length);
    expect(FOOD_CLASS_BY_KEY.size).toBe(FOOD_CLASSES.length);
  });

  it('every class cites a source', () => {
    for (const c of FOOD_CLASSES) expect(c.source.trim()).not.toBe('', c.key);
  });

  it('every non-generic class has a term in each language', () => {
    for (const c of FOOD_CLASSES.filter((x) => !isGeneric(x.key))) {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(c.terms[lang].length).toBeGreaterThan(0, `${c.key}/${lang}`);
      }
    }
  });

  it('no term belongs to two classes', () => {
    const owner = new Map<string, string>();
    for (const c of FOOD_CLASSES) {
      for (const lang of SUPPORTED_LANGUAGES) {
        for (const term of c.terms[lang]) {
          const t = normalizeForClassification(term);
          expect(owner.has(t) && owner.get(t) !== c.key).toBe(false, `"${t}" in ${owner.get(t)} and ${c.key}`);
          owner.set(t, c.key);
        }
      }
    }
  });

  it('days are positive or null, and opened never outlasts sealed', () => {
    for (const c of FOOD_CLASSES) {
      for (const d of [c.sealedDays, c.openedDays, c.thawDays]) {
        expect(d === null || d > 0).toBe(true, c.key);
      }
      if (c.sealedDays !== null && c.openedDays !== null) {
        expect(c.openedDays).toBeLessThanOrEqual(c.sealedDays, c.key);
      }
    }
  });

  it('has exactly one generic class per FoodType', () => {
    const generics = FOOD_CLASSES.filter((c) => isGeneric(c.key));
    expect(generics.length).toBe(Object.values(FoodType).length);
    for (const t of Object.values(FoodType)) {
      const g = genericClassFor(t);
      expect(g.key).toBe(`generic-${t}`);
      expect(g.foodType).toBe(t);
      expect(generics.filter((c) => c.foodType === t).length).toBe(1);
    }
  });

  it('household generic never expires', () => {
    expect(genericClassFor(FoodType.HOUSEHOLD).sealedDays).toBeNull();
  });
});
