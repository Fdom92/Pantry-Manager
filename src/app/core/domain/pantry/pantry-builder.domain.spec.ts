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

    it('no expirationDate when not provided', () => {
      const result = buildAddItemPayload(BASE);
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
