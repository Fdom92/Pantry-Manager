import { buildEventQuantities, buildExpireBatchKey, computeDaysToExpiry } from './event.domain';

describe('computeDaysToExpiry', () => {
  // Madrid, summer, so a plain YYYY-MM-DD parsed as UTC lands two hours into the
  // day and every comparison against a real instant comes out a day early.
  const at = (time: string): string => `2026-08-25T${time}:00+02:00`;

  it('reports zero when the event happens on the expiry day', () => {
    for (const time of ['06:00', '10:00', '18:00', '23:00']) {
      expect(computeDaysToExpiry('2026-08-25', at(time)))
        .withContext(`consumed at ${time}`)
        .toBe(0);
    }
  });

  it('counts a whole day ahead as one, not zero', () => {
    expect(computeDaysToExpiry('2026-08-26', at('10:00'))).toBe(1);
    expect(computeDaysToExpiry('2026-08-26', at('23:00'))).toBe(1);
  });

  it('goes negative only once the date has genuinely passed', () => {
    expect(computeDaysToExpiry('2026-08-24', at('10:00'))).toBe(-1);
    expect(computeDaysToExpiry('2026-08-20', at('10:00'))).toBe(-5);
  });

  it('handles a week out', () => {
    expect(computeDaysToExpiry('2026-09-01', at('10:00'))).toBe(7);
  });

  it('returns undefined when either side is missing or unparseable', () => {
    expect(computeDaysToExpiry(undefined, at('10:00'))).toBeUndefined();
    expect(computeDaysToExpiry('2026-08-25', 'not a date')).toBeUndefined();
  });
});

describe('buildEventQuantities', () => {
  it('keeps a quantity that was given', () => {
    expect(buildEventQuantities({ quantity: 3 }).quantity).toBe(3);
  });

  it('falls back to zero for a quantity that is not a number', () => {
    expect(buildEventQuantities({ quantity: NaN }).quantity).toBe(0);
    expect(buildEventQuantities({ quantity: undefined }).quantity).toBe(0);
  });

  it('derives the delta from the before and after when it was not supplied', () => {
    const result = buildEventQuantities({ quantity: 1, previousQuantity: 5, nextQuantity: 2 });
    expect(result.deltaQuantity).toBe(-3);
  });

  it('prefers an explicit delta over one it could derive', () => {
    const result = buildEventQuantities({
      quantity: 1, previousQuantity: 5, nextQuantity: 2, deltaQuantity: -99,
    });
    expect(result.deltaQuantity).toBe(-99);
  });

  it('leaves the delta undefined when there is nothing to derive it from', () => {
    expect(buildEventQuantities({ quantity: 1, previousQuantity: 5 }).deltaQuantity).toBeUndefined();
    expect(buildEventQuantities({ quantity: 1 }).deltaQuantity).toBeUndefined();
  });
});

describe('buildExpireBatchKey', () => {
  it('identifies a batch by its id when it has one', () => {
    expect(buildExpireBatchKey('item:1', { batchId: 'b1' })).toBe('item:1::b1');
  });

  it('falls back to the expiry date when there is no batch id', () => {
    expect(buildExpireBatchKey('item:1', { expirationDate: '2026-08-25' })).toBe('item:1::2026-08-25');
  });

  it('prefers the batch id over the date', () => {
    expect(buildExpireBatchKey('item:1', { batchId: 'b1', expirationDate: '2026-08-25' }))
      .toBe('item:1::b1');
  });

  it('returns null for a batch with no identity at all', () => {
    // No key means no dedupe entry, which is what stops an unidentifiable batch
    // from silently colliding with another one.
    expect(buildExpireBatchKey('item:1', {})).toBeNull();
    expect(buildExpireBatchKey('item:1', { expirationDate: '   ' })).toBeNull();
  });

  it('separates the same batch id across different products', () => {
    expect(buildExpireBatchKey('item:1', { batchId: 'b1' }))
      .not.toBe(buildExpireBatchKey('item:2', { batchId: 'b1' }));
  });
});
