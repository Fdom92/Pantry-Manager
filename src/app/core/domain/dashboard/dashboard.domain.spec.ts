import { computeTodaySuggestion } from './dashboard.domain';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let idCounter = 0;
function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  idCounter++;
  return {
    _id: `item-${idCounter}`,
    _rev: '1-a',
    type: 'item',
    householdId: 'hh1',
    name: `Item ${idCounter}`,
    categoryId: '',
    batches: [],
    productType: 'pantry',
    foodType: FoodType.PROTEIN,
    ...overrides,
  } as PantryItem;
}

function makeBatch(quantity: number, expirationDate?: string) {
  return { batchId: `b-${Math.random()}`, quantity, expirationDate };
}

function pantryItem(name: string, daysToExpiry: number, qty = 1, foodType = FoodType.PROTEIN): PantryItem {
  return makeItem({
    name,
    foodType,
    batches: [makeBatch(qty, daysFromNow(daysToExpiry))],
  });
}

// ── LAYER 1 — Activation ─────────────────────────────────────────────────────

describe('computeTodaySuggestion — LAYER 1: Activation', () => {
  beforeEach(() => { idCounter = 0; });

  it('returns null when allItems is empty', () => {
    expect(computeTodaySuggestion([], [])).toBeNull();
  });

  it('returns null when all items have no stock', () => {
    const item = makeItem({ batches: [makeBatch(0, daysFromNow(2))] });
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('returns null when all items are HOUSEHOLD (excluded from food items)', () => {
    const item = pantryItem('Dishwasher tablets', 3);
    item.foodType = FoodType.HOUSEHOLD;
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('excludes items with no expiry date and normal state (no urgency signal)', () => {
    const item = makeItem({ batches: [makeBatch(1)] }); // no expirationDate
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('admits pantry item expiring within 15 days', () => {
    const item = pantryItem('Chicken', 5);
    const result = computeTodaySuggestion([], [item]);
    expect(result).not.toBeNull();
    expect(result!.protagonist.name).toBe('Chicken');
  });

  it('admits review-state item (past printed date, within grace)', () => {
    // DAIRY 3 days past date → review state
    const item = makeItem({
      name: 'Yogurt',
      foodType: FoodType.DAIRY,
      batches: [makeBatch(1, daysFromNow(-3))],
    });
    const result = computeTodaySuggestion([], [item]);
    expect(result).not.toBeNull();
    expect(result!.reasonKey).toBe('dashboard.today.reason.reviewExpiry');
  });

  it('excludes fresh item with state != near-expiry (>3 day window)', () => {
    const item = makeItem({
      productType: 'fresh',
      foodType: FoodType.VEGETABLE,
      batches: [makeBatch(3, daysFromNow(5))], // 5 days → normal for fresh (3d window)
    });
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('admits fresh item within 3-day window', () => {
    const item = makeItem({
      name: 'Spinach',
      productType: 'fresh',
      foodType: FoodType.VEGETABLE,
      batches: [makeBatch(3, daysFromNow(2))], // 2 days → near-expiry for fresh
    });
    const result = computeTodaySuggestion([], [item]);
    expect(result).not.toBeNull();
  });
});

// ── LAYER 2 — Priority scoring ────────────────────────────────────────────────

describe('computeTodaySuggestion — LAYER 2: Priority (urgency only)', () => {
  beforeEach(() => { idCounter = 0; });

  it('item expiring tomorrow (d=1, score 95) wins over d=5 (score 80)', () => {
    const urgent = pantryItem('Chicken', 1);
    const less   = pantryItem('Rice', 5);
    const result = computeTodaySuggestion([], [less, urgent]);
    expect(result!.protagonist.name).toBe('Chicken');
  });

  it('same score → item closer to expiry wins (tiebreaker by days ASC)', () => {
    const d3a = pantryItem('Milk', 3, 1, FoodType.DAIRY);
    const d3b = pantryItem('Yogurt', 4, 1, FoodType.DAIRY);
    // both d=3-4 → score 80; d=3 wins tiebreaker
    const result = computeTodaySuggestion([], [d3b, d3a]);
    expect(result!.protagonist.name).toBe('Milk');
  });

  it('food type does NOT affect protagonist selection — only urgency', () => {
    // Protein has higher food-type score in old system; in v2 food type is irrelevant
    const dairy   = makeItem({ name: 'Yogurt', foodType: FoodType.DAIRY,   batches: [makeBatch(1, daysFromNow(1))] });
    const protein = makeItem({ name: 'Chicken', foodType: FoodType.PROTEIN, batches: [makeBatch(1, daysFromNow(3))] });
    // d=1 → score 95, d=3 → score 80. Dairy wins despite food type.
    const result = computeTodaySuggestion([], [protein, dairy]);
    expect(result!.protagonist.name).toBe('Yogurt');
  });

  it('review item (score 55 + 10 boost = 65) appears above display cutoff 60', () => {
    const review = makeItem({
      name: 'Old Bread',
      foodType: FoodType.CARB,
      batches: [makeBatch(1, daysFromNow(-2))], // 2 days past → review for CARB
    });
    const result = computeTodaySuggestion([], [review]);
    expect(result).not.toBeNull();
    expect(result!.reasonKey).toBe('dashboard.today.reason.reviewExpiry');
  });
});

// ── LAYER 4 — Display (cutoff, secondaries, reason keys) ─────────────────────

describe('computeTodaySuggestion — LAYER 4: Display', () => {
  beforeEach(() => { idCounter = 0; });

  it('returns null when best score < 60 (display cutoff)', () => {
    // d=16 → score 0 → below cutoff
    const item = pantryItem('Rice', 16);
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('d=11 (score 40) is excluded — below HOY_DISPLAY_CUTOFF=60', () => {
    const item = pantryItem('Pasta', 11);
    expect(computeTodaySuggestion([], [item])).toBeNull();
  });

  it('d=10 (score 60) meets display cutoff exactly — shown', () => {
    const item = pantryItem('Tuna', 10);
    expect(computeTodaySuggestion([], [item])).not.toBeNull();
  });

  it('returns up to 2 secondary items', () => {
    const a = pantryItem('A', 1);
    const b = pantryItem('B', 2);
    const c = pantryItem('C', 3);
    const result = computeTodaySuggestion([], [a, b, c]);
    expect(result!.secondaryItems.length).toBeLessThanOrEqual(2);
    expect(result!.protagonist.name).toBe('A');
    const secondaryNames = result!.secondaryItems.map(s => s.name);
    expect(secondaryNames).not.toContain('A');
  });

  it('protagonist is excluded from secondaries', () => {
    const a = pantryItem('A', 1);
    const b = pantryItem('B', 2);
    const result = computeTodaySuggestion([], [a, b]);
    const secondaryIds = result!.secondaryItems.map(s => s.id);
    expect(secondaryIds).not.toContain(result!.protagonist.id);
  });

  describe('reasonKey', () => {
    it('d<=2 → expiringsoon', () => {
      const result = computeTodaySuggestion([], [pantryItem('X', 1)]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.expiringsoon');
    });

    it('d=0 → expiringsoon', () => {
      const result = computeTodaySuggestion([], [pantryItem('X', 0)]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.expiringsoon');
    });

    it('d=3 → expirestoday', () => {
      const result = computeTodaySuggestion([], [pantryItem('X', 3)]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.expirestoday');
    });

    it('d=5 → expirestoday', () => {
      const result = computeTodaySuggestion([], [pantryItem('X', 5)]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.expirestoday');
    });

    it('d=6 → expiringlater', () => {
      const result = computeTodaySuggestion([], [pantryItem('X', 6)]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.expiringlater');
    });

    it('fresh item → freshExpiring', () => {
      const item = makeItem({
        name: 'Tomato',
        productType: 'fresh',
        foodType: FoodType.VEGETABLE,
        batches: [makeBatch(3, daysFromNow(1))],
      });
      const result = computeTodaySuggestion([], [item]);
      expect(result!.reasonKey).toBe('dashboard.today.reason.freshExpiring');
    });
  });
});

// ── Anti-repetition ───────────────────────────────────────────────────────────

describe('computeTodaySuggestion — anti-repetition (skipId)', () => {
  beforeEach(() => { idCounter = 0; });

  it('rotates to 2nd item when skipId matches top and scores are close (<15 pts)', () => {
    const a = pantryItem('A', 3); // score 80
    const b = pantryItem('B', 4); // score 80 — same band, <15 pt diff
    const result = computeTodaySuggestion([], [a, b], a._id);
    expect(result!.protagonist.name).toBe('B');
  });

  it('keeps top item when skipId matches but score gap >= 15 pts', () => {
    const a = pantryItem('A', 1); // score 95
    const b = pantryItem('B', 6); // score 60 — gap is 35 pts
    const result = computeTodaySuggestion([], [a, b], a._id);
    expect(result!.protagonist.name).toBe('A'); // gap too large to rotate
  });

  it('ignores skipId when only one candidate exists', () => {
    const a = pantryItem('A', 2);
    const result = computeTodaySuggestion([], [a], a._id);
    expect(result!.protagonist.name).toBe('A'); // no alternative
  });
});
