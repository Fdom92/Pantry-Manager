import { calculateUrgencyScore } from './urgency.domain';

describe('calculateUrgencyScore', () => {

  // ── State gates (checked before daysToExpiry) ────────────────────────────

  describe('expired state', () => {
    it('returns score 100 critical regardless of days', () => {
      const r = calculateUrgencyScore('expired', null);
      expect(r.score).toBe(100);
      expect(r.level).toBe('critical');
    });

    it('returns score 100 critical even when days provided', () => {
      const r = calculateUrgencyScore('expired', -5);
      expect(r.score).toBe(100);
      expect(r.level).toBe('critical');
    });
  });

  describe('review state', () => {
    it('returns score 55 alert regardless of days', () => {
      const r = calculateUrgencyScore('review', null);
      expect(r.score).toBe(55);
      expect(r.level).toBe('alert');
    });

    it('returns score 55 alert even when days provided', () => {
      const r = calculateUrgencyScore('review', -3);
      expect(r.score).toBe(55);
      expect(r.level).toBe('alert');
    });
  });

  // ── daysToExpiry bands (near-expiry state) ────────────────────────────────

  describe('d=0 (expires today)', () => {
    it('returns score 95 critical', () => {
      const r = calculateUrgencyScore('near-expiry', 0);
      expect(r.score).toBe(95);
      expect(r.level).toBe('critical');
    });
  });

  describe('d=1 (expires tomorrow)', () => {
    it('returns score 95 critical — same urgency as today', () => {
      const r = calculateUrgencyScore('near-expiry', 1);
      expect(r.score).toBe(95);
      expect(r.level).toBe('critical');
    });
  });

  describe('d=2', () => {
    it('returns score 90 critical', () => {
      const r = calculateUrgencyScore('near-expiry', 2);
      expect(r.score).toBe(90);
      expect(r.level).toBe('critical');
    });
  });

  describe('d=3 (alert band starts)', () => {
    it('returns score 80 alert', () => {
      const r = calculateUrgencyScore('near-expiry', 3);
      expect(r.score).toBe(80);
      expect(r.level).toBe('alert');
    });
  });

  describe('d=5 (alert band boundary)', () => {
    it('returns score 80 alert', () => {
      const r = calculateUrgencyScore('near-expiry', 5);
      expect(r.score).toBe(80);
      expect(r.level).toBe('alert');
    });
  });

  describe('d=6 (second alert band)', () => {
    it('returns score 60 alert', () => {
      const r = calculateUrgencyScore('near-expiry', 6);
      expect(r.score).toBe(60);
      expect(r.level).toBe('alert');
    });
  });

  describe('d=10 (second alert band boundary)', () => {
    it('returns score 60 alert', () => {
      const r = calculateUrgencyScore('near-expiry', 10);
      expect(r.score).toBe(60);
      expect(r.level).toBe('alert');
    });
  });

  describe('d=11 (preventive band)', () => {
    it('returns score 40 preventive', () => {
      const r = calculateUrgencyScore('near-expiry', 11);
      expect(r.score).toBe(40);
      expect(r.level).toBe('preventive');
    });
  });

  describe('d=15 (preventive band boundary)', () => {
    it('returns score 40 preventive', () => {
      const r = calculateUrgencyScore('near-expiry', 15);
      expect(r.score).toBe(40);
      expect(r.level).toBe('preventive');
    });
  });

  describe('d=16 (beyond window)', () => {
    it('returns score 0 none', () => {
      const r = calculateUrgencyScore('near-expiry', 16);
      expect(r.score).toBe(0);
      expect(r.level).toBe('none');
    });
  });

  // ── null / no date ────────────────────────────────────────────────────────

  describe('daysToExpiry null (no date)', () => {
    it('returns score 0 none for near-expiry state without date', () => {
      const r = calculateUrgencyScore('near-expiry', null);
      expect(r.score).toBe(0);
      expect(r.level).toBe('none');
    });

    it('returns score 0 none for low-stock state', () => {
      const r = calculateUrgencyScore('low-stock', null);
      expect(r.score).toBe(0);
      expect(r.level).toBe('none');
    });

    it('returns score 0 none for normal state', () => {
      const r = calculateUrgencyScore('normal', null);
      expect(r.score).toBe(0);
      expect(r.level).toBe('none');
    });
  });

  // ── Timezone edge: negative days normalised to 0 ──────────────────────────

  describe('negative daysToExpiry (timezone edge)', () => {
    it('normalises -0.x to 0 via Math.max → score 95 critical', () => {
      // Represents same-day expiry that Math.ceil resolves to 0 or slightly negative
      const r = calculateUrgencyScore('near-expiry', -0.1 as any);
      expect(r.score).toBe(95);
      expect(r.level).toBe('critical');
    });

    it('integer -1 normalises to 0 → score 95 critical', () => {
      // Should not occur normally (expired state would be used), but guard holds
      const r = calculateUrgencyScore('near-expiry', -1);
      expect(r.score).toBe(95);
      expect(r.level).toBe('critical');
    });
  });

  // ── Score ordering invariants ─────────────────────────────────────────────

  describe('score ordering', () => {
    it('today (95) > d=2 (90) > d=5 (80) > review (55) > d=10 (60)', () => {
      // Note: review (55) < d=10 (60) — review has lower base score by design.
      // The HOY engine adds HOY_REVIEW_BOOST (+10) on top when displaying.
      expect(calculateUrgencyScore('near-expiry', 0).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 2).score);
      expect(calculateUrgencyScore('near-expiry', 2).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 5).score);
      expect(calculateUrgencyScore('near-expiry', 5).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 10).score);
      expect(calculateUrgencyScore('near-expiry', 10).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 15).score);
      expect(calculateUrgencyScore('near-expiry', 15).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 16).score);
    });

    it('expired (100) is always highest score', () => {
      expect(calculateUrgencyScore('expired', null).score)
        .toBeGreaterThan(calculateUrgencyScore('near-expiry', 0).score);
    });
  });
});
