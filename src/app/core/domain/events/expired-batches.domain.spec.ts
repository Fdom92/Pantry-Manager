import type { PantryEvent } from '@core/models/events';
import type { PantryItem } from '@core/models/pantry';
import { selectUnloggedExpiredBatches } from './expired-batches.domain';

const NOW = new Date('2026-08-25T12:00:00');

function item(over: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: over._id ?? 'item:leche',
    type: 'item',
    name: over.name ?? 'Leche',
    productType: over.productType ?? 'pantry',
    categoryId: '',
    batches: over.batches ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PantryItem;
}

function expireEvent(over: Partial<PantryEvent> = {}): PantryEvent {
  return {
    _id: 'event:1',
    type: 'event',
    eventType: 'EXPIRE',
    productId: over.productId ?? 'item:leche',
    productName: 'Leche',
    quantity: 1,
    timestamp: '2026-08-20T00:00:00.000Z',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...over,
  } as PantryEvent;
}

describe('selectUnloggedExpiredBatches', () => {
  it('picks an expired batch that has never been logged', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 2, expirationDate: '2026-08-01' }] });

    const selected = selectUnloggedExpiredBatches([leche], [], NOW);

    expect(selected.length).toBe(1);
    expect(selected[0].item).toBe(leche);
    expect(selected[0].quantity).toBe(2);
    expect(selected[0].batchKey).toBe('item:leche::b1');
  });

  it('leaves a batch that has not expired yet', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 2, expirationDate: '2026-12-01' }] });

    expect(selectUnloggedExpiredBatches([leche], [], NOW)).toEqual([]);
  });

  it('leaves a batch with no date — nothing to have expired', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 2 }] });

    expect(selectUnloggedExpiredBatches([leche], [], NOW)).toEqual([]);
  });

  it('leaves a batch with nothing left in it', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 0, expirationDate: '2026-08-01' }] });

    expect(selectUnloggedExpiredBatches([leche], [], NOW)).toEqual([]);
  });

  it('does not log the same batch twice, matching on the key the event stored', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 2, expirationDate: '2026-08-01' }] });
    const already = expireEvent({ sourceMetadata: { batchKey: 'item:leche::b1' } });

    expect(selectUnloggedExpiredBatches([leche], [already], NOW)).toEqual([]);
  });

  it('tolerates whitespace around the stored key', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 2, expirationDate: '2026-08-01' }] });
    const already = expireEvent({ sourceMetadata: { batchKey: '  item:leche::b1  ' } });

    expect(selectUnloggedExpiredBatches([leche], [already], NOW)).toEqual([]);
  });

  /**
   * The batchId of a fresh product is regenerated every time its single batch is
   * consolidated, so a key built from it would stop matching after any edit and
   * the same expiry would be logged again. Fresh products key on the date.
   */
  describe('fresh products key on the date, not the batch id', () => {
    it('keys a fresh batch by product and date', () => {
      const lechuga = item({
        _id: 'item:lechuga',
        productType: 'fresh',
        batches: [{ batchId: 'regenerado-1', quantity: 3, expirationDate: '2026-08-01' }],
      });

      const selected = selectUnloggedExpiredBatches([lechuga], [], NOW);

      expect(selected[0].batchKey).toBe('item:lechuga::2026-08-01');
    });

    it('still recognises it after the batch id changed', () => {
      const lechuga = item({
        _id: 'item:lechuga',
        productType: 'fresh',
        batches: [{ batchId: 'regenerado-2', quantity: 3, expirationDate: '2026-08-01' }],
      });
      const already = expireEvent({
        productId: 'item:lechuga',
        sourceMetadata: { batchKey: 'item:lechuga::2026-08-01' },
      });

      expect(selectUnloggedExpiredBatches([lechuga], [already], NOW)).toEqual([]);
    });
  });

  /**
   * Older events were keyed by batchId. They still have to suppress a re-log, so
   * a product/date pair from the event itself counts as seen too.
   */
  it('honours an old event that only carries productId and date', () => {
    const leche = item({ batches: [{ quantity: 2, expirationDate: '2026-08-01' }] });
    const legacy = expireEvent({ productId: 'item:leche', expirationDate: '2026-08-01' });

    expect(selectUnloggedExpiredBatches([leche], [legacy], NOW)).toEqual([]);
  });

  it('does not log the same key twice within a single sweep', () => {
    const leche = item({
      batches: [
        { quantity: 1, expirationDate: '2026-08-01' },
        { quantity: 1, expirationDate: '2026-08-01' },
      ],
    });

    expect(selectUnloggedExpiredBatches([leche], [], NOW).length).toBe(1);
  });

  it('walks every product and every batch', () => {
    const leche = item({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-08-01' }] });
    const arroz = item({
      _id: 'item:arroz',
      name: 'Arroz',
      batches: [
        { batchId: 'b2', quantity: 1, expirationDate: '2026-08-02' },
        { batchId: 'b3', quantity: 1, expirationDate: '2026-12-02' },
      ],
    });

    const selected = selectUnloggedExpiredBatches([leche, arroz], [], NOW);

    expect(selected.map(s => s.batchKey)).toEqual(['item:leche::b1', 'item:arroz::b2']);
  });

  it('survives a product with no batches array at all', () => {
    expect(selectUnloggedExpiredBatches([item({ batches: undefined })], [], NOW)).toEqual([]);
  });
});
