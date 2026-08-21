import { FoodType } from '@core/models/shared/enums.model';
import { FOOD_TYPE_PROFILE, foodTypeExpires } from './food-type-profile.domain';
import { getExpiryModeFromFoodType } from './pantry-status.domain';
import { suggestExpiryDate } from './expiry-suggestion.domain';
import deBundle from '../../../../assets/i18n/de.json';
import enBundle from '../../../../assets/i18n/en.json';
import esBundle from '../../../../assets/i18n/es.json';
import frBundle from '../../../../assets/i18n/fr.json';
import itBundle from '../../../../assets/i18n/it.json';
import ptBundle from '../../../../assets/i18n/pt.json';

/**
 * The profile table replaced five structures spread across four files. These
 * tests guard the seams that remain — the places a new food type could still be
 * added and quietly do the wrong thing.
 */
describe('FOOD_TYPE_PROFILE', () => {
  const allTypes = Object.values(FoodType);

  it('describes every member of the enum', () => {
    for (const type of allTypes) {
      expect(FOOD_TYPE_PROFILE[type]).withContext(type).toBeDefined();
    }
  });

  it('gives a date exactly to the types whose expiry is not ignored', () => {
    // The union type already makes the contradiction uncompilable. This asserts
    // the two consumers agree with the table once it is read back out.
    for (const type of allTypes) {
      const ignored = getExpiryModeFromFoodType(type) === 'ignore';
      expect(foodTypeExpires(type)).withContext(type).toBe(!ignored);
      expect(suggestExpiryDate(type, new Date('2026-01-01T12:00:00')) === undefined)
        .withContext(type)
        .toBe(ignored);
    }
  });

  it('treats an unknown food type as strict rather than ignoring it', () => {
    // An unclassified product still alerts. Silence is the dangerous default.
    expect(getExpiryModeFromFoodType(undefined)).toBe('strict');
  });

  it('gives every type a sane coverage weight', () => {
    for (const type of allTypes) {
      const { coverageWeight } = FOOD_TYPE_PROFILE[type];
      expect(coverageWeight).withContext(type).toBeGreaterThanOrEqual(0);
      expect(coverageWeight).withContext(type).toBeLessThanOrEqual(2);
    }
  });

  it('never weights a non-food type as food', () => {
    expect(FOOD_TYPE_PROFILE[FoodType.HOUSEHOLD].coverageWeight).toBe(0);
    expect(FOOD_TYPE_PROFILE[FoodType.BEVERAGE].coverageWeight).toBe(0);
  });

  it('keeps chart ranks unique so the order is deterministic', () => {
    const ranks = allTypes
      .map(t => FOOD_TYPE_PROFILE[t].chartRank)
      .filter((r): r is number => r !== null);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('never suggests eating something that is not a meal', () => {
    for (const type of allTypes) {
      if (FOOD_TYPE_PROFILE[type].coverageWeight === 0) {
        expect(FOOD_TYPE_PROFILE[type].suggestible).withContext(type).toBe(false);
      }
    }
  });

  it('has a label in all six languages for every type', () => {
    // The seventh table: translations live outside TypeScript, so nothing else
    // stops a new type from rendering its raw key on screen.
    const locales: [string, unknown][] = [
      ['es', esBundle], ['en', enBundle], ['de', deBundle],
      ['fr', frBundle], ['it', itBundle], ['pt', ptBundle],
    ];
    const missing: string[] = [];
    for (const [code, bundle] of locales) {
      const labels = (bundle as { pantry: { form: { foodType: Record<string, string> } } })
        .pantry.form.foodType;
      for (const type of allTypes) {
        if (!labels[type]) missing.push(`${code}.${type}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
