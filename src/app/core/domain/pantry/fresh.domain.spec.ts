import {
  FRESH_NEAR_EXPIRY_WINDOW_DAYS,
  FRESH_QTY,
  consolidateBatchesForFresh,
  getFreshExpiryUrgency,
  isFreshKeepInStock,
  qtyToFreshState,
} from './fresh.domain';
import type { PantryItem } from '@core/models/pantry';

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'item-1',
    _rev: '1-a',
    type: 'item',
    householdId: 'hh1',
    name: 'Test',
    categoryId: '',
    batches: [],
    productType: 'fresh',
    ...overrides,
  } as PantryItem;
}

function makeBatch(quantity: number, expirationDate?: string, opened = false) {
  return { batchId: `b-${Math.random()}`, quantity, expirationDate, opened };
}

// ── qtyToFreshState ──────────────────────────────────────────────────────────

describe('qtyToFreshState', () => {
  it('returns sufficient when qty >= 3 (FRESH_QTY.sufficient)', () => {
    expect(qtyToFreshState(3)).toBe('sufficient');
    expect(qtyToFreshState(5)).toBe('sufficient');
    expect(qtyToFreshState(100)).toBe('sufficient');
  });

  it('returns low when qty >= 1 and < 3', () => {
    expect(qtyToFreshState(1)).toBe('low');
    expect(qtyToFreshState(2)).toBe('low');
  });

  it('returns none when qty === 0', () => {
    expect(qtyToFreshState(0)).toBe('none');
  });

  it('returns none for negative qty', () => {
    expect(qtyToFreshState(-1)).toBe('none');
  });

  it('FRESH_QTY.sufficient boundary is exactly 3', () => {
    expect(FRESH_QTY.sufficient).toBe(3);
    expect(qtyToFreshState(FRESH_QTY.sufficient - 1)).toBe('low');
    expect(qtyToFreshState(FRESH_QTY.sufficient)).toBe('sufficient');
  });
});

// ── getFreshExpiryUrgency ────────────────────────────────────────────────────

describe('getFreshExpiryUrgency', () => {
  it('returns neutral when days is null (no expiry date)', () => {
    expect(getFreshExpiryUrgency(null)).toBe('neutral');
  });

  it('returns neutral when days > FRESH_NEAR_EXPIRY_WINDOW_DAYS (3)', () => {
    expect(getFreshExpiryUrgency(4)).toBe('neutral');
    expect(getFreshExpiryUrgency(10)).toBe('neutral');
  });

  it('returns critical when item is expired (days < 0)', () => {
    expect(getFreshExpiryUrgency(-1)).toBe('critical');
    expect(getFreshExpiryUrgency(-5)).toBe('critical');
  });

  it('returns critical when expires today (days = 0)', () => {
    expect(getFreshExpiryUrgency(0)).toBe('critical');
  });

  it('returns critical when expires tomorrow (days = 1)', () => {
    expect(getFreshExpiryUrgency(1)).toBe('critical');
  });

  it('returns critical when expires in 2 days', () => {
    // d=2 → urgency.domain score 90 (critical) → getFreshExpiryUrgency critical
    expect(getFreshExpiryUrgency(2)).toBe('critical');
  });

  it('returns warning when expires in 3 days (alert band, within window)', () => {
    // d=3 is exactly FRESH_NEAR_EXPIRY_WINDOW_DAYS → still inside window
    // urgency.domain d=3 → score 80 alert → 'warning'
    expect(getFreshExpiryUrgency(3)).toBe('warning');
  });

  it('FRESH_NEAR_EXPIRY_WINDOW_DAYS is 3', () => {
    expect(FRESH_NEAR_EXPIRY_WINDOW_DAYS).toBe(3);
  });

  it('d=3 is inside window, d=4 is outside', () => {
    expect(getFreshExpiryUrgency(3)).not.toBe('neutral');
    expect(getFreshExpiryUrgency(4)).toBe('neutral');
  });
});

// ── isFreshKeepInStock ───────────────────────────────────────────────────────

describe('isFreshKeepInStock', () => {
  it('returns true when isBasic is true', () => {
    expect(isFreshKeepInStock(makeItem({ isBasic: true }))).toBeTrue();
  });

  it('returns false when isBasic is false', () => {
    expect(isFreshKeepInStock(makeItem({ isBasic: false }))).toBeFalse();
  });

  it('returns false when isBasic is undefined', () => {
    expect(isFreshKeepInStock(makeItem({ isBasic: undefined }))).toBeFalse();
  });
});

// ── consolidateBatchesForFresh ───────────────────────────────────────────────

describe('consolidateBatchesForFresh', () => {
  const NEW_BATCH_ID = 'new-batch';

  it('sums quantities from all batches', () => {
    const batches = [makeBatch(2), makeBatch(1)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    // total=3 → sufficient → freshStateToQty(sufficient)=3
    expect(result.quantity).toBe(3);
    expect(result.batchId).toBe(NEW_BATCH_ID);
  });

  it('quantity reflects freshState (rounds down to state boundary)', () => {
    // total=5 → sufficient (>=3) → quantity=3
    const batches = [makeBatch(3), makeBatch(2)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    expect(result.quantity).toBe(3); // freshStateToQty('sufficient')=3
  });

  it('picks soonest future expiry date', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const batches = [makeBatch(1, nextWeek), makeBatch(1, tomorrow)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    expect(result.expirationDate).toBe(tomorrow);
  });

  it('prefers future dates over past dates', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const batches = [makeBatch(1, yesterday), makeBatch(2, tomorrow)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    expect(result.expirationDate).toBe(tomorrow);
  });

  it('marks as opened if any batch is opened', () => {
    const batches = [makeBatch(2, undefined, false), makeBatch(1, undefined, true)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    expect(result.opened).toBeTrue();
  });

  it('opened is false when no batch is opened', () => {
    const batches = [makeBatch(2), makeBatch(1)];
    const result = consolidateBatchesForFresh(batches, NEW_BATCH_ID);
    expect(result.opened).toBeFalse();
  });

  it('returns none-state quantity for empty batches', () => {
    const result = consolidateBatchesForFresh([], NEW_BATCH_ID);
    expect(result.quantity).toBe(0); // qtyToFreshState(0)=none → freshStateToQty(none)=0
  });
});
