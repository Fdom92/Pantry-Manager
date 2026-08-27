import { FoodType } from '@core/models/shared/enums.model';
import { buildAddItemPayload } from './pantry-builder.domain';

const BASE = {
  id: 'item-1',
  nowIso: new Date().toISOString(),
  name: 'Chicken',
  quantity: 2,
};

describe('buildAddItemPayload', () => {

  describe('name normalization', () => {
    it('trims whitespace from name', () => {
      const result = buildAddItemPayload({ ...BASE, name: '  Chicken  ' });
      expect(result.name).toBe('Chicken');
    });

    it('uses UNASSIGNED_PRODUCT_NAME for empty name', () => {
      const result = buildAddItemPayload({ ...BASE, name: '' });
      expect(result.name).toBeTruthy();
      expect(result.name.length).toBeGreaterThan(0);
    });

    it('uses UNASSIGNED_PRODUCT_NAME for whitespace-only name', () => {
      const result = buildAddItemPayload({ ...BASE, name: '   ' });
      expect(result.name).toBeTruthy();
    });
  });

  describe('quantity normalization', () => {
    it('accepts numeric quantity', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: 3 });
      expect(result.batches[0].quantity).toBe(3);
    });

    it('accepts string quantity with comma decimal', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: '2,5' });
      expect(result.batches[0].quantity).toBe(3); // roundQuantity(2.5)=3
    });

    it('accepts string quantity with dot decimal', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: '1.5' });
      expect(result.batches[0].quantity).toBe(2); // roundQuantity(1.5)=2
    });

    it('falls back to 1 for zero quantity', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: 0 });
      expect(result.batches[0].quantity).toBeGreaterThanOrEqual(1);
    });

    it('falls back to 1 for negative quantity', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: -5 });
      expect(result.batches[0].quantity).toBeGreaterThanOrEqual(1);
    });

    it('falls back to 1 for invalid string', () => {
      const result = buildAddItemPayload({ ...BASE, quantity: 'abc' });
      expect(result.batches[0].quantity).toBeGreaterThanOrEqual(1);
    });
  });

  describe('batch structure', () => {
    it('creates exactly one batch', () => {
      const result = buildAddItemPayload(BASE);
      expect(result.batches.length).toBe(1);
    });

    it('stores expirationDate on batch when provided', () => {
      const result = buildAddItemPayload({ ...BASE, expirationDate: '2026-12-31' });
      expect(result.batches[0].expirationDate).toBe('2026-12-31');
    });

    it('no expirationDate when not provided and the name is unrecognised', () => {
      // BASE.name ("Chicken") is in the food dictionary, so it would now get an
      // inferred date. Use a name the dictionary does not know to assert the
      // original contract: no date in, no date out.
      const result = buildAddItemPayload({ ...BASE, name: 'xyzzy' });
      expect(result.batches[0].expirationDate).toBeUndefined();
    });

    it('stores noExpiry on batch when provided', () => {
      const result = buildAddItemPayload({ ...BASE, noExpiry: true });
      expect(result.batches[0].noExpiry).toBeTrue();
    });

    it('stores locationId when defaultLocationId provided', () => {
      const result = buildAddItemPayload({ ...BASE, defaultLocationId: 'fridge' });
      expect(result.batches[0].locationId).toBe('fridge');
    });

    it('locationId is undefined when not provided', () => {
      const result = buildAddItemPayload(BASE);
      expect(result.batches[0].locationId).toBeUndefined();
    });
  });

  describe('item structure', () => {
    it('sets _id from params.id', () => {
      const result = buildAddItemPayload(BASE);
      expect(result._id).toBe('item-1');
    });

    it('sets createdAt and updatedAt to nowIso', () => {
      const result = buildAddItemPayload(BASE);
      expect(result.createdAt).toBe(BASE.nowIso);
      expect(result.updatedAt).toBe(BASE.nowIso);
    });

    it('uses provided householdId', () => {
      const result = buildAddItemPayload({ ...BASE, householdId: 'hh-custom' });
      expect(result.householdId).toBe('hh-custom');
    });

    it('computes expirationDate from batch when batch has date', () => {
      const result = buildAddItemPayload({ ...BASE, expirationDate: '2026-12-31' });
      expect(result.expirationDate).toBe('2026-12-31');
    });
  });
});

describe('buildAddItemPayload — foodType inference', () => {
  const base = { id: 'item:1', nowIso: '2026-01-01T12:00:00.000Z', quantity: 1 };

  it('infers foodType and fills the batch expiry for a known name', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche' });
    expect(item.foodType).toBe(FoodType.DAIRY);
    expect(item.batches[0].expirationDate).toBeDefined();
    expect(item.expirationDate).toBe(item.batches[0].expirationDate);
  });

  it('leaves foodType and expiry unset for an unknown name', () => {
    const item = buildAddItemPayload({ ...base, name: 'xyzzy' });
    expect(item.foodType).toBeUndefined();
    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('never overrides an explicit expirationDate from the caller', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche', expirationDate: '2026-03-15' });
    expect(item.batches[0].expirationDate).toBe('2026-03-15');
    expect(item.foodType).toBe(FoodType.DAIRY);
  });

  it('never sets an expiry when the caller marked the batch noExpiry', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche', noExpiry: true });
    expect(item.batches[0].expirationDate).toBeUndefined();
    expect(item.batches[0].noExpiry).toBe(true);
  });
});

describe('buildAddItemPayload — opting out of date inference', () => {
  const base = { id: 'item:1', nowIso: '2026-01-01T12:00:00.000Z', quantity: 1 };

  it('does not infer a date when the caller opted out', () => {
    // The add modal resolves the date itself, so a blank there is a deliberate
    // choice by the user — not an absence the builder should fill in.
    const item = buildAddItemPayload({ ...base, name: 'leche', inferExpiry: false });
    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('still classifies the foodType when date inference is opted out', () => {
    // Clearing a date is not the same as rejecting the classification, which
    // still feeds insights, waste tracking and the pendientes filter.
    const item = buildAddItemPayload({ ...base, name: 'leche', inferExpiry: false });
    expect(item.foodType).toBe(FoodType.DAIRY);
  });

  it('infers by default when the flag is omitted', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche' });
    expect(item.batches[0].expirationDate).toBeDefined();
  });
});

/**
 * The name is a guess; a type the caller states came from a picker or a curated
 * list. When the two are available the stated one has to win for the *date* as
 * well as the stored field — reading the date off the name regardless is what
 * left onboarding's French "Œufs" and Portuguese "Grão-de-bico" with no expiry
 * even though their food type was declared in the seed table all along.
 */
describe('an explicit food type beats the name', () => {
  it('dates a product whose name means nothing to the inference', () => {
    const item = buildAddItemPayload({ ...BASE, name: 'Œufs', foodType: FoodType.PROTEIN });

    expect(item.foodType).toBe(FoodType.PROTEIN);
    expect(item.batches[0].expirationDate).toBeDefined();
  });

  it('leaves such a product dateless when no type is stated', () => {
    const item = buildAddItemPayload({ ...BASE, name: 'Œufs' });

    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('derives the date from the stated type, not the one the name suggests', () => {
    const asGuessed = buildAddItemPayload({ ...BASE, name: 'Leche' });
    const asStated = buildAddItemPayload({ ...BASE, name: 'Leche', foodType: FoodType.NON_PERISHABLE });

    expect(asStated.foodType).toBe(FoodType.NON_PERISHABLE);
    expect(asStated.batches[0].expirationDate).not.toBe(asGuessed.batches[0].expirationDate);
  });

  it('marks a stated type that never expires instead of dating it', () => {
    const item = buildAddItemPayload({ ...BASE, name: 'Zzzz', foodType: FoodType.HOUSEHOLD });

    expect(item.batches[0].noExpiry).toBeTrue();
    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('still lets an explicit date from the caller win over both', () => {
    const item = buildAddItemPayload({
      ...BASE, name: 'Leche', foodType: FoodType.PROTEIN, expirationDate: '2027-03-01',
    });

    expect(item.batches[0].expirationDate).toBe('2027-03-01');
  });
});
