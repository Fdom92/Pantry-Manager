import { determineSuggestionNeed, ensureMinimumSuggestedQuantity, sortSuggestionsByUrgency } from './list.domain';
import { ShoppingReason } from '@core/models/list';
import type { ShoppingSuggestionWithItem } from '@core/models/list';

// ── determineSuggestionNeed ───────────────────────────────────────────────────

describe('determineSuggestionNeed', () => {

  describe('pantry items (isFresh = false)', () => {
    it('returns EMPTY when qty is 0', () => {
      const r = determineSuggestionNeed({ totalQuantity: 0, minThreshold: null });
      expect(r.reason).toBe(ShoppingReason.EMPTY);
    });

    it('returns suggestedQuantity=1 when minThreshold is null and qty=0', () => {
      const r = determineSuggestionNeed({ totalQuantity: 0, minThreshold: null });
      expect(r.suggestedQuantity).toBeGreaterThanOrEqual(1);
    });

    it('returns suggestedQuantity based on minThreshold when qty=0', () => {
      const r = determineSuggestionNeed({ totalQuantity: 0, minThreshold: 5 });
      expect(r.reason).toBe(ShoppingReason.EMPTY);
      expect(r.suggestedQuantity).toBe(5);
    });

    it('returns BELOW_MIN when qty > 0 but < minThreshold', () => {
      const r = determineSuggestionNeed({ totalQuantity: 1, minThreshold: 3 });
      expect(r.reason).toBe(ShoppingReason.BELOW_MIN);
      expect(r.suggestedQuantity).toBe(2); // 3 - 1 = 2
    });

    it('returns null when qty >= minThreshold', () => {
      const r = determineSuggestionNeed({ totalQuantity: 3, minThreshold: 3 });
      expect(r.reason).toBeNull();
    });

    it('returns null when qty > 0 and minThreshold is null', () => {
      const r = determineSuggestionNeed({ totalQuantity: 2, minThreshold: null });
      expect(r.reason).toBeNull();
    });
  });

  describe('fresh items (isFresh = true)', () => {
    it('returns FRESH_EMPTY when qty is 0', () => {
      const r = determineSuggestionNeed({ totalQuantity: 0, minThreshold: null, isFresh: true });
      expect(r.reason).toBe(ShoppingReason.FRESH_EMPTY);
    });

    it('returns suggestedQuantity 0 for FRESH_EMPTY (caller handles quantity)', () => {
      const r = determineSuggestionNeed({ totalQuantity: 0, minThreshold: null, isFresh: true });
      expect(r.suggestedQuantity).toBe(0);
    });

    it('returns FRESH_LOW when qty > 0 (caller already verified item needs restocking)', () => {
      const r = determineSuggestionNeed({ totalQuantity: 1, minThreshold: null, isFresh: true });
      expect(r.reason).toBe(ShoppingReason.FRESH_LOW);
    });

    it('returns suggestedQuantity 0 for FRESH_LOW (quantity managed by caller)', () => {
      const r = determineSuggestionNeed({ totalQuantity: 2, minThreshold: null, isFresh: true });
      expect(r.suggestedQuantity).toBe(0);
    });
  });
});

// ── ensureMinimumSuggestedQuantity ───────────────────────────────────────────

describe('ensureMinimumSuggestedQuantity', () => {
  it('returns rounded positive value', () => {
    expect(ensureMinimumSuggestedQuantity(2.6)).toBe(3);
  });

  it('returns 1 when value is 0 and no fallback', () => {
    expect(ensureMinimumSuggestedQuantity(0)).toBe(1);
  });

  it('returns fallback when value rounds to 0', () => {
    expect(ensureMinimumSuggestedQuantity(0, 3)).toBe(3);
  });

  it('returns 1 when both value and fallback are 0', () => {
    expect(ensureMinimumSuggestedQuantity(0, 0)).toBe(1);
  });
});

// ── sortSuggestionsByUrgency ──────────────────────────────────────────────────

describe('sortSuggestionsByUrgency', () => {
  function makeSuggestion(reason: ShoppingReason): ShoppingSuggestionWithItem {
    return { reason } as ShoppingSuggestionWithItem;
  }

  it('FRESH_EMPTY (1) sorts before EMPTY (2)', () => {
    const items = [makeSuggestion(ShoppingReason.EMPTY), makeSuggestion(ShoppingReason.FRESH_EMPTY)];
    const sorted = sortSuggestionsByUrgency(items);
    expect(sorted[0].reason).toBe(ShoppingReason.FRESH_EMPTY);
  });

  it('EMPTY (2) sorts before BELOW_MIN (3)', () => {
    const items = [makeSuggestion(ShoppingReason.BELOW_MIN), makeSuggestion(ShoppingReason.EMPTY)];
    const sorted = sortSuggestionsByUrgency(items);
    expect(sorted[0].reason).toBe(ShoppingReason.EMPTY);
  });

  it('BELOW_MIN (3) sorts before MANUAL (4)', () => {
    const items = [makeSuggestion(ShoppingReason.MANUAL), makeSuggestion(ShoppingReason.BELOW_MIN)];
    const sorted = sortSuggestionsByUrgency(items);
    expect(sorted[0].reason).toBe(ShoppingReason.BELOW_MIN);
  });

  it('does not mutate input array', () => {
    const items = [makeSuggestion(ShoppingReason.MANUAL), makeSuggestion(ShoppingReason.EMPTY)];
    const original = [...items];
    sortSuggestionsByUrgency(items);
    expect(items[0].reason).toBe(original[0].reason);
  });
});
