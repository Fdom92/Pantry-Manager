import type { ItemBatch } from '@core/models/pantry';
import deBundle from '../../../../assets/i18n/de.json';
import enBundle from '../../../../assets/i18n/en.json';
import esBundle from '../../../../assets/i18n/es.json';
import frBundle from '../../../../assets/i18n/fr.json';
import itBundle from '../../../../assets/i18n/it.json';
import ptBundle from '../../../../assets/i18n/pt.json';
import { applyFifoConsumption, collectBatches, hasConsumableStock, computeEarliestExpiry, mergeBatchesByExpiry, normalizeBatches, sumQuantities } from './pantry-batch.domain';

function batch(overrides: Partial<ItemBatch> = {}): ItemBatch {
  return { batchId: 'b1', quantity: 1, opened: false, ...overrides } as ItemBatch;
}

// ─── collectBatches ───────────────────────────────────────────────────────────

describe('collectBatches', () => {
  it('returns empty array for undefined input', () => {
    expect(collectBatches(undefined)).toEqual([]);
  });

  it('filters out null/falsy entries', () => {
    const result = collectBatches([null as any, batch({ batchId: 'ok' })]);
    expect(result.length).toBe(1);
    expect(result[0].batchId).toBe('ok');
  });

  it('coerces quantity to number', () => {
    const result = collectBatches([batch({ quantity: '3' as any })]);
    expect(result[0].quantity).toBe(3);
  });

  it('defaults opened to false when undefined', () => {
    const result = collectBatches([batch({ opened: undefined })]);
    expect(result[0].opened).toBe(false);
  });

  it('generates batchId when missing and generator provided', () => {
    let n = 0;
    const gen = () => `gen-${++n}`;
    const result = collectBatches([batch({ batchId: undefined })], { generateBatchId: gen });
    expect(result[0].batchId).toBe('gen-1');
  });
});

// ─── sumQuantities ────────────────────────────────────────────────────────────

describe('sumQuantities', () => {
  it('returns 0 for empty array', () => {
    expect(sumQuantities([])).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(sumQuantities(undefined)).toBe(0);
  });

  it('sums quantities across batches', () => {
    expect(sumQuantities([batch({ quantity: 2 }), batch({ quantity: 3 })])).toBe(5);
  });

  it('applies round function when provided', () => {
    const round = (v: number) => Math.round(v);
    expect(sumQuantities([batch({ quantity: 1.4 }), batch({ quantity: 1.4 })], { round })).toBe(3);
  });
});

// ─── mergeBatchesByExpiry ─────────────────────────────────────────────────────

describe('mergeBatchesByExpiry', () => {
  it('returns clones for single batch', () => {
    const b = batch({ expirationDate: '2025-01-01' });
    const result = mergeBatchesByExpiry([b]);
    expect(result[0]).not.toBe(b);
    expect(result[0].quantity).toBe(b.quantity);
  });

  it('merges batches with same expiry + location', () => {
    const b1 = batch({ batchId: 'a', expirationDate: '2025-06-01', locationId: 'fridge', quantity: 2 });
    const b2 = batch({ batchId: 'b', expirationDate: '2025-06-01', locationId: 'fridge', quantity: 3 });
    const result = mergeBatchesByExpiry([b1, b2]);
    expect(result.length).toBe(1);
    expect(result[0].quantity).toBe(5);
  });

  it('does not merge batches with different expiry dates', () => {
    const b1 = batch({ expirationDate: '2025-06-01', quantity: 1 });
    const b2 = batch({ expirationDate: '2025-07-01', quantity: 1 });
    expect(mergeBatchesByExpiry([b1, b2]).length).toBe(2);
  });

  it('does not merge batches with no expiry date (kept separate)', () => {
    const b1 = batch({ batchId: 'a', expirationDate: undefined, quantity: 1 });
    const b2 = batch({ batchId: 'b', expirationDate: undefined, quantity: 2 });
    const result = mergeBatchesByExpiry([b1, b2]);
    expect(result.length).toBe(2);
  });

  it('marks merged batch as opened if either source is opened', () => {
    const b1 = batch({ expirationDate: '2025-06-01', opened: true });
    const b2 = batch({ expirationDate: '2025-06-01', opened: false });
    const result = mergeBatchesByExpiry([b1, b2]);
    expect(result[0].opened).toBe(true);
  });
});

// ─── normalizeBatches ─────────────────────────────────────────────────────────

describe('normalizeBatches', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeBatches(undefined)).toEqual([]);
  });

  it('coerces string quantities and merges same-expiry batches', () => {
    const b1 = batch({ expirationDate: '2025-06-01', quantity: '2' as any });
    const b2 = batch({ expirationDate: '2025-06-01', quantity: '3' as any });
    const result = normalizeBatches([b1, b2]);
    expect(result.length).toBe(1);
    expect(result[0].quantity).toBe(5);
  });
});

// ─── applyFifoConsumption ─────────────────────────────────────────────────────

describe('applyFifoConsumption', () => {
  it('returns clones unchanged for amount 0', () => {
    const batches = [batch({ quantity: 3 })];
    const result = applyFifoConsumption(batches, 0);
    expect(result[0].quantity).toBe(3);
  });

  it('removes batch fully consumed', () => {
    const result = applyFifoConsumption([batch({ quantity: 2 })], 2);
    expect(result.length).toBe(0);
  });

  it('partially reduces a batch', () => {
    const result = applyFifoConsumption([batch({ quantity: 5 })], 3);
    expect(result.length).toBe(1);
    expect(result[0].quantity).toBe(2);
  });

  it('consumes earliest expiry first (FIFO)', () => {
    const early = batch({ batchId: 'early', expirationDate: '2025-01-01', quantity: 2 });
    const late  = batch({ batchId: 'late',  expirationDate: '2025-12-31', quantity: 3 });
    const result = applyFifoConsumption([late, early], 2);
    expect(result.find(b => b.batchId === 'early')).toBeUndefined();
    expect(result.find(b => b.batchId === 'late')?.quantity).toBe(3);
  });

  it('consumes batches without expiry date last', () => {
    const dated   = batch({ batchId: 'dated',   expirationDate: '2025-06-01', quantity: 1 });
    const undated = batch({ batchId: 'undated', expirationDate: undefined,    quantity: 5 });
    const result  = applyFifoConsumption([undated, dated], 1);
    expect(result.find(b => b.batchId === 'dated')).toBeUndefined();
    expect(result.find(b => b.batchId === 'undated')?.quantity).toBe(5);
  });

  it('consumes across multiple batches correctly', () => {
    const b1 = batch({ batchId: '1', expirationDate: '2025-01-01', quantity: 2 });
    const b2 = batch({ batchId: '2', expirationDate: '2025-06-01', quantity: 3 });
    const result = applyFifoConsumption([b1, b2], 4);
    expect(result.length).toBe(1);
    expect(result[0].batchId).toBe('2');
    expect(result[0].quantity).toBe(1);
  });

  it('does not consume more than available', () => {
    const result = applyFifoConsumption([batch({ quantity: 1 })], 999);
    expect(result.length).toBe(0);
  });

  it('does not mutate original batches', () => {
    const original = [batch({ quantity: 3 })];
    applyFifoConsumption(original, 2);
    expect(original[0].quantity).toBe(3);
  });
});

// ─── computeEarliestExpiry ────────────────────────────────────────────────────

describe('computeEarliestExpiry', () => {
  it('returns undefined for empty batches', () => {
    expect(computeEarliestExpiry([])).toBeUndefined();
  });

  it('returns undefined when no batch has expiry date', () => {
    expect(computeEarliestExpiry([batch({ expirationDate: undefined })])).toBeUndefined();
  });

  it('returns the only expiry date', () => {
    expect(computeEarliestExpiry([batch({ expirationDate: '2025-06-01' })])).toBe('2025-06-01');
  });

  it('returns earliest date among multiple batches', () => {
    const batches = [
      batch({ expirationDate: '2025-12-01' }),
      batch({ expirationDate: '2025-03-01' }),
      batch({ expirationDate: '2025-06-15' }),
    ];
    expect(computeEarliestExpiry(batches)).toBe('2025-03-01');
  });

  it('ignores batches without expiry date when others have one', () => {
    const batches = [
      batch({ expirationDate: undefined }),
      batch({ expirationDate: '2025-06-01' }),
    ];
    expect(computeEarliestExpiry(batches)).toBe('2025-06-01');
  });
});

describe('mergeBatchesByExpiry — batches with no date', () => {
  it('adds together two batches explicitly marked as never expiring', () => {
    // Buying bin bags twice should leave one row of two, not two rows of one.
    const merged = mergeBatchesByExpiry([
      { batchId: 'a', quantity: 1, noExpiry: true },
      { batchId: 'b', quantity: 1, noExpiry: true },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].quantity).toBe(2);
    expect(merged[0].noExpiry).toBe(true);
  });

  it('keeps never-expiring batches apart when they sit in different places', () => {
    const merged = mergeBatchesByExpiry([
      { batchId: 'a', quantity: 1, noExpiry: true, locationId: 'kitchen' },
      { batchId: 'b', quantity: 1, noExpiry: true, locationId: 'garage' },
    ]);
    expect(merged.length).toBe(2);
  });

  it('leaves batches of unknown expiry alone', () => {
    // No date is not the same claim as no expiry: these two could spoil weeks
    // apart, so adding them together would invent a fact.
    const merged = mergeBatchesByExpiry([
      { batchId: 'a', quantity: 1 },
      { batchId: 'b', quantity: 1 },
    ]);
    expect(merged.length).toBe(2);
  });

  it('does not fold an undated batch into a never-expiring one', () => {
    const merged = mergeBatchesByExpiry([
      { batchId: 'a', quantity: 1, noExpiry: true },
      { batchId: 'b', quantity: 1 },
    ]);
    expect(merged.length).toBe(2);
  });

  it('still keeps a dated batch separate from a never-expiring one', () => {
    const merged = mergeBatchesByExpiry([
      { batchId: 'a', quantity: 1, noExpiry: true },
      { batchId: 'b', quantity: 1, expirationDate: '2026-09-01' },
    ]);
    expect(merged.length).toBe(2);
  });
});

/**
 * The two dateless states behave in opposite ways — `noExpiry` batches merge,
 * unknown-date ones stay apart — so a user who cannot tell the labels apart is
 * left watching identical-looking rows sometimes combine and sometimes not.
 *
 * German shipped both labels as the exact same string ("Kein Ablaufdatum")
 * from the commit that introduced noExpiry until 5.3, which is precisely the
 * kind of collision no reviewer reads six bundles to catch.
 */
describe('the two dateless labels', () => {
  const locales: [string, unknown][] = [
    ['es', esBundle], ['en', enBundle], ['de', deBundle],
    ['fr', frBundle], ['it', itBundle], ['pt', ptBundle],
  ];

  function labels(bundle: unknown) {
    return (bundle as { pantry: { batches: Record<string, string> } }).pantry.batches;
  }

  it('never spells "no expiry" and "date missing" the same way', () => {
    const collisions: string[] = [];
    for (const [code, bundle] of locales) {
      const { noExpiryIntentional, noExpiryDate } = labels(bundle);
      if (noExpiryIntentional === noExpiryDate) {
        collisions.push(`${code}: both are "${noExpiryDate}"`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('defines both labels in every language', () => {
    const missing: string[] = [];
    for (const [code, bundle] of locales) {
      const batches = labels(bundle);
      for (const key of ['noExpiryIntentional', 'noExpiryDate']) {
        if (!batches[key]) missing.push(`${code}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('hasConsumableStock', () => {
  const product = (quantities: number[], productType: 'pantry' | 'fresh' = 'pantry') =>
    ({
      _id: `item:${quantities.join('-')}`,
      type: 'product',
      name: 'X',
      categoryId: 'c',
      productType,
      batches: quantities.map((quantity, i) => ({ batchId: `b${i}`, quantity })),
    }) as never;

  it('is false for an empty pantry', () => {
    expect(hasConsumableStock([])).toBeFalse();
  });

  it('is false when every product is at zero', () => {
    expect(hasConsumableStock([product([0]), product([0, 0])])).toBeFalse();
  });

  it('is true as soon as one lot of one product has stock', () => {
    expect(hasConsumableStock([product([0]), product([0, 2])])).toBeTrue();
  });

  it('counts fresh products, which the consume modal also lists', () => {
    expect(hasConsumableStock([product([1], 'fresh')])).toBeTrue();
  });

  it('is false for a product with no lots at all', () => {
    expect(hasConsumableStock([product([])])).toBeFalse();
  });
});
