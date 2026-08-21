import { FoodType } from '@core/models/shared/enums.model';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';
import {
  computeActivitySignals,
  computeCategoryBreakdown,
  computeDerivedFeatures,
  computeInventorySignals,
  computePatternSignals,
  computeProductSignals,
} from './insights-pro-payload.domain';

/**
 * These functions build the payload sent to the model for PRO users, so a wrong
 * number here does not surface as a visible glitch — it comes back as confident
 * advice built on a false premise. Every branch that can divide, sort or index
 * is exercised on an empty pantry too, since that is where this file crashed in
 * production once already.
 */

const NOW = new Date('2026-05-14T12:00:00');
const DAY = 24 * 60 * 60 * 1000;

/** An ISO timestamp `daysAgo` days before NOW. */
const ago = (daysAgo: number): string => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

/** A `YYYY-MM-DD` date `days` from NOW (negative for the past). */
const ymd = (days: number): string => {
  const d = new Date(NOW.getTime() + days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let itemSeq = 0;
function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  itemSeq += 1;
  const batches: ItemBatch[] = overrides.batches ?? [
    { batchId: `b${itemSeq}`, quantity: 1, expirationDate: ymd(90) },
  ];
  return {
    _id: `item:${itemSeq}`,
    name: `Product ${itemSeq}`,
    productType: 'pantry',
    createdAt: ago(60),
    updatedAt: ago(60),
    ...overrides,
    batches,
  } as PantryItem;
}

function makeEvent(overrides: Partial<PantryEvent> = {}): PantryEvent {
  return {
    eventType: 'ADD',
    timestamp: ago(1),
    ...overrides,
  } as PantryEvent;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('computeInventorySignals', () => {
  it('returns null waste and zero ratios for an empty pantry', () => {
    const s = computeInventorySignals([], NOW);
    expect(s.totalProducts).toBe(0);
    expect(s.wasteRatio).toBeNull();
    expect(s.noExpiryRatio).toBe(0);
  });

  it('counts an expired item as expired and nothing else', () => {
    // The states are exclusive by construction: an expired item must not also
    // land in nearExpiry or lowStock, or the counts sum past the inventory.
    const s = computeInventorySignals([makeItem({
      foodType: FoodType.PROTEIN,
      batches: [{ batchId: 'b', quantity: 1, expirationDate: ymd(-5) }],
    })], NOW);
    expect(s.expiredCount).toBe(1);
    expect(s.nearExpiryCount).toBe(0);
    expect(s.lowStockCount).toBe(0);
  });

  it('reports waste as the expired share of the whole inventory', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'a', quantity: 1, expirationDate: ymd(-3) }] }),
      makeItem({ batches: [{ batchId: 'b', quantity: 1, expirationDate: ymd(200) }] }),
      makeItem({ batches: [{ batchId: 'c', quantity: 1, expirationDate: ymd(200) }] }),
      makeItem({ batches: [{ batchId: 'd', quantity: 1, expirationDate: ymd(200) }] }),
    ];
    expect(computeInventorySignals(items, NOW).wasteRatio).toBe(0.25);
  });

  it('counts an item with any dateless batch as missing a date', () => {
    // Shares hasMissingExpiry with the Pendientes chip, so the ratio the model
    // reasons over is the same figure the user is shown.
    const items = [makeItem({ batches: [
      { batchId: 'a', quantity: 1, expirationDate: ymd(30) },
      { batchId: 'b', quantity: 1 },
    ] })];
    expect(computeInventorySignals(items, NOW).noExpiryRatio).toBe(1);
  });

  it('does not count a batch deliberately marked as never expiring', () => {
    const items = [makeItem({ batches: [{ batchId: 'a', quantity: 1, noExpiry: true }] })];
    expect(computeInventorySignals(items, NOW).noExpiryRatio).toBe(0);
  });
});

describe('computeActivitySignals', () => {
  it('reports stable with no waste ratio when nothing happened', () => {
    const s = computeActivitySignals([], 30, NOW);
    expect(s.wasteRatio).toBeNull();
    expect(s.inventoryDelta).toBe('stable');
  });

  it('ignores events older than the window', () => {
    const events = [makeEvent({ eventType: 'ADD', timestamp: ago(45) })];
    expect(computeActivitySignals(events, 30, NOW).addedCount).toBe(0);
  });

  it('measures waste against what left the pantry, not what is in it', () => {
    // 1 expired against 3 that left = 1/3, regardless of inventory size.
    const events = [
      makeEvent({ eventType: 'EXPIRE' }),
      makeEvent({ eventType: 'CONSUME' }),
      makeEvent({ eventType: 'CONSUME' }),
    ];
    expect(computeActivitySignals(events, 30, NOW).wasteRatio).toBeCloseTo(1 / 3, 5);
  });

  it('calls the inventory growing when nothing has left but things came in', () => {
    const events = [makeEvent({ eventType: 'ADD' }), makeEvent({ eventType: 'ADD' })];
    expect(computeActivitySignals(events, 30, NOW).inventoryDelta).toBe('growing');
  });

  it('calls it shrinking when outflow clearly outpaces what came in', () => {
    const events = [
      makeEvent({ eventType: 'ADD' }),
      makeEvent({ eventType: 'CONSUME' }),
      makeEvent({ eventType: 'CONSUME' }),
      makeEvent({ eventType: 'CONSUME' }),
    ];
    expect(computeActivitySignals(events, 30, NOW).inventoryDelta).toBe('shrinking');
  });

  it('calls a matched inflow and outflow stable', () => {
    const events = [
      makeEvent({ eventType: 'ADD' }),
      makeEvent({ eventType: 'ADD' }),
      makeEvent({ eventType: 'CONSUME' }),
      makeEvent({ eventType: 'CONSUME' }),
    ];
    expect(computeActivitySignals(events, 30, NOW).inventoryDelta).toBe('stable');
  });
});

describe('computePatternSignals', () => {
  it('returns all-null on empty input rather than throwing', () => {
    // The sorts index [0][0]; an unguarded empty map is what crashed here before.
    expect(computePatternSignals([], [], NOW, 30)).toEqual({
      mostWastefulFoodType: null,
      mostConsumedFoodType: null,
      leastRotatingFoodType: null,
      overrepresentedCategory: null,
      underusedCategory: null,
    });
  });

  it('names the food type that expired most often', () => {
    const events = [
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.VEGETABLE }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.VEGETABLE }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.PROTEIN }),
    ];
    expect(computePatternSignals([], events, NOW, 30).mostWastefulFoodType)
      .toBe(FoodType.VEGETABLE);
  });

  it('never blames household or unclassified products', () => {
    // Neither says anything actionable about how the user eats.
    const events = [
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.HOUSEHOLD }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.OTHER }),
    ];
    expect(computePatternSignals([], events, NOW, 30).mostWastefulFoodType).toBeNull();
  });

  it('flags a type that takes more than a quarter of the active inventory', () => {
    const items = [
      makeItem({ foodType: FoodType.CARB }),
      makeItem({ foodType: FoodType.CARB }),
      makeItem({ foodType: FoodType.CARB }),
      makeItem({ foodType: FoodType.FRUIT }),
    ];
    expect(computePatternSignals(items, [], NOW, 30).overrepresentedCategory)
      .toBe(FoodType.CARB);
  });

  it('leaves expired stock out of the inventory it reasons about', () => {
    const items = [
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'a', quantity: 1, expirationDate: ymd(-9) }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b', quantity: 1, expirationDate: ymd(-9) }] }),
    ];
    const p = computePatternSignals(items, [], NOW, 30);
    expect(p.overrepresentedCategory).toBeNull();
    expect(p.underusedCategory).toBeNull();
  });

  it('names a type the user stocks but never eats', () => {
    const items = [
      makeItem({ foodType: FoodType.VEGETABLE }),
      makeItem({ foodType: FoodType.VEGETABLE }),
      makeItem({ foodType: FoodType.VEGETABLE }),
    ];
    expect(computePatternSignals(items, [], NOW, 30).underusedCategory)
      .toBe(FoodType.VEGETABLE);
  });

  it('stops calling a type underused once it has been consumed', () => {
    const items = [
      makeItem({ foodType: FoodType.VEGETABLE }),
      makeItem({ foodType: FoodType.VEGETABLE }),
      makeItem({ foodType: FoodType.VEGETABLE }),
    ];
    const events = [makeEvent({ eventType: 'CONSUME', foodType: FoodType.VEGETABLE })];
    expect(computePatternSignals(items, events, NOW, 30).underusedCategory).toBeNull();
  });
});

describe('computeCategoryBreakdown', () => {
  it('returns nothing for an empty pantry', () => {
    expect(computeCategoryBreakdown([], [], NOW, 30)).toEqual([]);
  });

  it('sorts by how much of each type is held and keeps only the top five', () => {
    const items = [
      ...Array.from({ length: 4 }, () => makeItem({ foodType: FoodType.CARB })),
      ...Array.from({ length: 3 }, () => makeItem({ foodType: FoodType.PROTEIN })),
      makeItem({ foodType: FoodType.FRUIT }),
      makeItem({ foodType: FoodType.DAIRY }),
      makeItem({ foodType: FoodType.VEGETABLE }),
      makeItem({ foodType: FoodType.BEVERAGE }),
      makeItem({ foodType: FoodType.NON_PERISHABLE }),
    ];
    const rows = computeCategoryBreakdown(items, [], NOW, 30);
    expect(rows.length).toBe(5);
    expect(rows[0].foodType).toBe(FoodType.CARB);
    expect(rows[0].count).toBe(4);
    expect(rows[1].foodType).toBe(FoodType.PROTEIN);
  });

  it('rates rotation from how much moved relative to how much is held', () => {
    const items = [makeItem({ foodType: FoodType.DAIRY })];
    const busy = [
      makeEvent({ eventType: 'CONSUME', foodType: FoodType.DAIRY }),
      makeEvent({ eventType: 'CONSUME', foodType: FoodType.DAIRY }),
    ];
    expect(computeCategoryBreakdown(items, busy, NOW, 30)[0].rotationScore).toBe('high');
    expect(computeCategoryBreakdown(items, [], NOW, 30)[0].rotationScore).toBe('low');
  });

  it('reports no waste for a type with no movement at all', () => {
    // Rather than dividing by zero.
    const rows = computeCategoryBreakdown([makeItem({ foodType: FoodType.FRUIT })], [], NOW, 30);
    expect(rows[0].expiredRatio).toBe(0);
    expect(rows[0].consumptionShare).toBe(0);
  });

  it('splits consumption share across types', () => {
    const items = [
      makeItem({ foodType: FoodType.FRUIT }),
      makeItem({ foodType: FoodType.DAIRY }),
    ];
    const events = [
      makeEvent({ eventType: 'CONSUME', foodType: FoodType.FRUIT }),
      makeEvent({ eventType: 'CONSUME', foodType: FoodType.FRUIT }),
      makeEvent({ eventType: 'CONSUME', foodType: FoodType.DAIRY }),
    ];
    const rows = computeCategoryBreakdown(items, events, NOW, 30);
    const fruit = rows.find(r => r.foodType === FoodType.FRUIT)!;
    expect(fruit.consumptionShare).toBeCloseTo(2 / 3, 5);
  });
});

describe('computeProductSignals', () => {
  it('returns empty lists for an empty pantry', () => {
    expect(computeProductSignals([], [], NOW, 30)).toEqual({
      nearExpiryProducts: [],
      recentlyExpiredProducts: [],
      staleProducts: [],
    });
  });

  it('lists products about to expire, capped at five', () => {
    const items = Array.from({ length: 7 }, (_, i) => makeItem({
      name: `Soon ${i}`,
      batches: [{ batchId: `s${i}`, quantity: 1, expirationDate: ymd(2) }],
    }));
    expect(computeProductSignals(items, [], NOW, 30).nearExpiryProducts.length).toBe(5);
  });

  it('lists each recently expired product once, however many events it has', () => {
    const events = [
      makeEvent({ eventType: 'EXPIRE', productName: 'Yogur', timestamp: ago(2) }),
      makeEvent({ eventType: 'EXPIRE', productName: 'Yogur', timestamp: ago(3) }),
      makeEvent({ eventType: 'EXPIRE', productName: 'Pan', timestamp: ago(1) }),
    ];
    expect(computeProductSignals([], events, NOW, 30).recentlyExpiredProducts)
      .toEqual(['Yogur', 'Pan']);
  });

  it('only calls an expiry recent within the last week', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', productName: 'Viejo', timestamp: ago(20) })];
    expect(computeProductSignals([], events, NOW, 30).recentlyExpiredProducts).toEqual([]);
  });

  it('calls a stocked product stale when no event has touched it', () => {
    const items = [makeItem({ name: 'Olvidado' })];
    expect(computeProductSignals(items, [], NOW, 30).staleProducts).toEqual(['Olvidado']);
  });

  it('does not call a product stale when it saw activity in the window', () => {
    const items = [makeItem({ name: 'Usado' })];
    const events = [makeEvent({ productName: 'Usado', timestamp: ago(3) })];
    expect(computeProductSignals(items, events, NOW, 30).staleProducts).toEqual([]);
  });

  it('matches stale products by exact name', () => {
    // Item names and event names both come from the app's own storage, so this
    // holds — but it is an exact-string join, not the accent-folding key the
    // rest of the app matches names with.
    const items = [makeItem({ name: 'Atún' })];
    const events = [makeEvent({ productName: 'Atun', timestamp: ago(3) })];
    expect(computeProductSignals(items, events, NOW, 30).staleProducts).toEqual(['Atún']);
  });

  it('does not call an out-of-stock product stale', () => {
    const items = [makeItem({ name: 'Vacio', batches: [{ batchId: 'v', quantity: 0 }] })];
    expect(computeProductSignals(items, [], NOW, 30).staleProducts).toEqual([]);
  });
});

describe('computeDerivedFeatures', () => {
  const inventory = (over: Partial<ReturnType<typeof computeInventorySignals>> = {}) => ({
    totalProducts: 10, expiredCount: 0, nearExpiryCount: 0, reviewCount: 0,
    lowStockCount: 0, wasteRatio: 0, noExpiryRatio: 0, ...over,
  });
  const activity = (over: Partial<ReturnType<typeof computeActivitySignals>> = {}) => ({
    addedCount: 0, consumedCount: 0, expiredCount: 0,
    wasteRatio: null as number | null, inventoryDelta: 'stable' as const, ...over,
  });

  it('holds everything at its calm value with nothing to go on', () => {
    const d = computeDerivedFeatures(inventory({ totalProducts: 0 }), activity(), []);
    expect(d).toEqual({
      inventoryTrend: 'stable',
      wasteTrend: 'stable',
      riskLevel: 'low',
      inventoryBalanceScore: 'balanced',
    });
  });

  it('reads a growing inventory as an upward trend', () => {
    expect(computeDerivedFeatures(inventory(), activity({ inventoryDelta: 'growing' }), []).inventoryTrend)
      .toBe('up');
  });

  it('calls waste worsening past a third and improving below a tenth', () => {
    expect(computeDerivedFeatures(inventory(), activity({ wasteRatio: 0.5 }), []).wasteTrend)
      .toBe('worsening');
    expect(computeDerivedFeatures(inventory(), activity({ wasteRatio: 0.05 }), []).wasteTrend)
      .toBe('improving');
  });

  it('raises risk as expired and near-expiry take over the pantry', () => {
    expect(computeDerivedFeatures(inventory({ expiredCount: 4 }), activity(), []).riskLevel)
      .toBe('high');
    expect(computeDerivedFeatures(inventory({ nearExpiryCount: 2 }), activity(), []).riskLevel)
      .toBe('medium');
    expect(computeDerivedFeatures(inventory(), activity(), []).riskLevel).toBe('low');
  });

  it('calls the pantry highly imbalanced when one type is over half of it', () => {
    const breakdown = [
      { foodType: FoodType.CARB, count: 8, consumedCount: 0, consumptionShare: 0, expiredRatio: 0, rotationScore: 'low' as const },
      { foodType: FoodType.FRUIT, count: 2, consumedCount: 0, consumptionShare: 0, expiredRatio: 0, rotationScore: 'low' as const },
    ];
    expect(computeDerivedFeatures(inventory(), activity(), breakdown).inventoryBalanceScore)
      .toBe('highly_imbalanced');
  });

  it('measures balance against the five types it reports, not the whole pantry', () => {
    // computeCategoryBreakdown caps its output at five, and the share is taken
    // over that slice. With more types held than are reported, the leader's
    // share reads higher here than it truly is.
    const breakdown = [
      { foodType: FoodType.CARB, count: 4, consumedCount: 0, consumptionShare: 0, expiredRatio: 0, rotationScore: 'low' as const },
      { foodType: FoodType.FRUIT, count: 3, consumedCount: 0, consumptionShare: 0, expiredRatio: 0, rotationScore: 'low' as const },
      { foodType: FoodType.DAIRY, count: 3, consumedCount: 0, consumptionShare: 0, expiredRatio: 0, rotationScore: 'low' as const },
    ];
    expect(computeDerivedFeatures(inventory({ totalProducts: 40 }), activity(), breakdown).inventoryBalanceScore)
      .toBe('imbalanced');
  });
});
