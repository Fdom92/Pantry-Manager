# Dashboard / Insights Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip analytical cards from Dashboard (leaving only operational/action content) and expand Insights to absorb them — giving each tab a single clear identity.

**Architecture:** Pure domain functions (`insights-free.domain.ts`) absorb `computePantryScore`, `computeFoodCoverage`, `computePantryHealthState` from the dashboard domain. `InsightsStateService` gains new computed signals from these functions. `DashboardStateService` drops all analytical signals. Dashboard template removes Layers 1+4; Insights template adds 4 new sections (status banner, coverage, quality, food-type fixes).

**Tech Stack:** Angular 20, Ionic 8, Signals, PouchDB, `@ngx-translate`, Karma/Jasmine tests (`ng test`)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/app/core/domain/insights/insights-free.domain.ts` | Add computePantryScore, computeFoodCoverage, PantryHealthState, computePantryHealthState; update computeActivityMetrics + computeDistribution |
| Modify | `src/app/core/domain/insights/insights-free.domain.spec.ts` | Tests for all new/changed domain functions |
| Modify | `src/app/core/services/insights/insights-state.service.ts` | Add pantryHealthState, pantryScore, foodCoverage, staleCount signals; fix activityMetrics call |
| Modify | `src/app/core/services/dashboard/dashboard-state.service.ts` | Remove pantryHealth, pantryScore, foodCoverage, insightService, recentlyUpdatedItems |
| Modify | `src/app/features/dashboard/dashboard.component.html` | Remove Layer 1 (health/score/coverage) + Layer 4 (insight cards) |
| Modify | `src/app/features/dashboard/dashboard.component.ts` | Remove InsightCardComponent import |
| Modify | `src/app/core/domain/dashboard/dashboard.domain.ts` | Remove computePantryScore, computeFoodCoverage, getRecentItemsByUpdatedAt |
| Delete | `src/app/core/services/dashboard/dashboard-insight.service.ts` | No longer used |
| Delete | `src/app/core/constants/dashboard/insights.constants.ts` | No longer used |
| Modify | `src/app/core/constants/dashboard/index.ts` | Remove re-export of insights.constants |
| Modify | `src/app/features/insights/insights.component.html` | Full rework: 7 sections |
| Modify | `src/app/features/insights/insights.component.ts` | Add getRotationLabel, getPantryHealthIcon helpers |
| Modify | `src/assets/i18n/en.json` | New insights keys |
| Modify | `src/assets/i18n/es.json` | New insights keys |
| Modify | `src/assets/i18n/de.json` | New insights keys |
| Modify | `src/assets/i18n/fr.json` | New insights keys |
| Modify | `src/assets/i18n/it.json` | New insights keys |
| Modify | `src/assets/i18n/pt.json` | New insights keys |

---

### Task 1: Move computePantryScore + computeFoodCoverage to insights-free.domain.ts

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`

- [ ] **Step 1: Write failing tests for computePantryScore and computeFoodCoverage**

Add to `src/app/core/domain/insights/insights-free.domain.spec.ts` (before the closing brace of the file):

```ts
describe('computePantryScore', () => {
  it('returns null when fewer than 3 items', () => {
    expect(computePantryScore(2, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('returns excellent label when score >= 85 with no issues', () => {
    const result = computePantryScore(10, 0, 0, 0, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.label).toBe('excellent');
  });

  it('applies strong penalty for expired items', () => {
    const result = computePantryScore(10, 2, 0, 0, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(85);
    expect(result!.label).not.toBe('excellent');
  });

  it('applies soft penalty for no-date items', () => {
    const perfect = computePantryScore(10, 0, 0, 0, 0, 0)!;
    const withNoDate = computePantryScore(10, 0, 0, 5, 0, 0)!;
    expect(withNoDate.score).toBeLessThan(perfect.score);
  });

  it('returns poor label when score < 40', () => {
    // 5 expired out of 10 → score well below 40
    const result = computePantryScore(10, 5, 0, 0, 0, 0);
    expect(result!.label).toBe('poor');
  });
});

describe('computeFoodCoverage', () => {
  it('returns null when fewer than 3 items', () => {
    const items = [makeItem(), makeItem()];
    expect(computeFoodCoverage(items)).toBeNull();
  });

  it('returns null when total portions are 0', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 0 }] }),
    ];
    expect(computeFoodCoverage(items)).toBeNull();
  });

  it('returns days unit for small quantities', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
      makeItem({ batches: [{ batchId: 'b1', quantity: 3 }] }),
    ];
    const result = computeFoodCoverage(items)!;
    expect(result.unit).toBe('days');
    expect(result.value).toBeGreaterThan(0);
  });

  it('returns months unit when >= 30 days', () => {
    const items = Array.from({ length: 5 }, () =>
      makeItem({ batches: [{ batchId: 'b1', quantity: 20 }] })
    );
    const result = computeFoodCoverage(items)!;
    expect(['months', 'years']).toContain(result.unit);
  });

  it('enhanced flag is true when >= 50% of items have foodType', () => {
    const items = [
      makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b1', quantity: 5 }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 5 }] }),
    ];
    const result = computeFoodCoverage(items)!;
    expect(result.enhanced).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: `computePantryScore` and `computeFoodCoverage` not found.

- [ ] **Step 3: Add computePantryScore and computeFoodCoverage to insights-free.domain.ts**

Add to the END of `src/app/core/domain/insights/insights-free.domain.ts`:

```ts
// ─── Pantry Score ─────────────────────────────────────────────────────────────

export type PantryScoreLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface PantryScoreResult {
  score: number;
  label: PantryScoreLabel;
}

/**
 * Computes a 0–100 pantry health score.
 * Returns null when fewer than 3 items (not enough signal).
 */
export function computePantryScore(
  total: number,
  expired: number,
  nearExpiry: number,
  noDateCount: number,
  lowStock: number,
  stale: number,
): PantryScoreResult | null {
  if (total < 3) return null;

  let score = 100;

  if (expired > 0) {
    score -= Math.min(40, 15 + (expired / total) * 30);
  }
  if (nearExpiry > 0) {
    score -= Math.min(20, 8 + (nearExpiry / total) * 15);
  }

  score -= (noDateCount / total) * 15;
  score -= (lowStock / total) * 10;
  score -= (stale / total) * 5;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let label: PantryScoreLabel;
  if (score >= 85) label = 'excellent';
  else if (score >= 65) label = 'good';
  else if (score >= 40) label = 'fair';
  else label = 'poor';

  return { score, label };
}

// ─── Food Coverage ────────────────────────────────────────────────────────────

export type FoodCoverageUnit = 'days' | 'months' | 'years';

export interface FoodCoverageResult {
  value: number;
  unit: FoodCoverageUnit;
  enhanced: boolean;
}

const FOOD_TYPE_WEIGHTS: Record<FoodType, number> = {
  [FoodType.PROTEIN]:   1.2,
  [FoodType.CARB]:      1.1,
  [FoodType.VEGETABLE]: 0.9,
  [FoodType.FRUIT]:     0.6,
  [FoodType.DAIRY]:     0.6,
  [FoodType.OTHER]:     0.4,
  [FoodType.HOUSEHOLD]: 0,
};

const FOOD_TYPE_COVERAGE_THRESHOLD = 0.5;

/**
 * Estimates food coverage in days/months/years based on active item quantities.
 * Assumes 3 meal portions per day. Returns null when fewer than 3 items.
 */
export function computeFoodCoverage(activeItems: PantryItem[]): FoodCoverageResult | null {
  if (activeItems.length < 3) return null;

  const classifiedCount = activeItems.filter(i => i.foodType).length;
  const enhanced = classifiedCount / activeItems.length >= FOOD_TYPE_COVERAGE_THRESHOLD;

  const totalPortions = activeItems.reduce((sum, item) => {
    const quantity = (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);
    const weight = enhanced && item.foodType ? FOOD_TYPE_WEIGHTS[item.foodType] : 1.0;
    return sum + quantity * weight;
  }, 0);

  if (totalPortions === 0) return null;

  const days = Math.max(1, Math.floor(totalPortions / 3));

  if (days >= 365) return { value: Math.max(1, Math.round(days / 365)), unit: 'years', enhanced };
  if (days >= 30)  return { value: Math.max(1, Math.round(days / 30)),  unit: 'months', enhanced };
  return { value: days, unit: 'days', enhanced };
}
```

Also add `FoodType` import to the existing import line if not already present — it already exists in the file.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts
git commit -m "feat(insights-domain): add computePantryScore and computeFoodCoverage"
```

---

### Task 2: Add PantryHealthState + computePantryHealthState to insights-free.domain.ts

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/app/core/domain/insights/insights-free.domain.spec.ts`:

```ts
describe('computePantryHealthState', () => {
  it('returns CRITICAL when expired > 0', () => {
    expect(computePantryHealthState(2, 0, 10, 5, 0)).toBe(PantryHealthState.CRITICAL);
  });

  it('returns ATTENTION when nearExpiry > 0 and no expired', () => {
    expect(computePantryHealthState(0, 3, 10, 5, 0)).toBe(PantryHealthState.ATTENTION);
  });

  it('returns ATTENTION when total > 10 and fewer than 30% items have dates', () => {
    // total=20, withDates=4 (20%), expired=0, nearExpiry=0
    expect(computePantryHealthState(0, 0, 20, 4, 0)).toBe(PantryHealthState.ATTENTION);
  });

  it('returns OPTIMAL when no issues', () => {
    expect(computePantryHealthState(0, 0, 10, 8, 0)).toBe(PantryHealthState.OPTIMAL);
  });

  it('CRITICAL takes precedence over nearExpiry', () => {
    expect(computePantryHealthState(1, 5, 10, 5, 0)).toBe(PantryHealthState.CRITICAL);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: `computePantryHealthState` not found.

- [ ] **Step 3: Add PantryHealthState enum and computePantryHealthState to insights-free.domain.ts**

Add after the `FoodCoverage` block at the end of `src/app/core/domain/insights/insights-free.domain.ts`:

```ts
// ─── Pantry Health State ──────────────────────────────────────────────────────

export enum PantryHealthState {
  CRITICAL  = 'critical',
  ATTENTION = 'attention',
  OPTIMAL   = 'optimal',
}

/**
 * Derives pantry health state from expiry/tracking signals.
 * withDates = count of non-basic items that have at least one dated batch.
 */
export function computePantryHealthState(
  expired: number,
  nearExpiry: number,
  total: number,
  withDates: number,
  stale: number,
): PantryHealthState {
  if (expired > 0) return PantryHealthState.CRITICAL;
  if (nearExpiry > 0) return PantryHealthState.ATTENTION;
  if (total > 10 && withDates < total * 0.3) return PantryHealthState.ATTENTION;
  return PantryHealthState.OPTIMAL;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts
git commit -m "feat(insights-domain): add PantryHealthState and computePantryHealthState"
```

---

### Task 3: Update computeActivityMetrics — add rotationRatio

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`
- Modify: `src/app/core/services/insights/insights-state.service.ts`

- [ ] **Step 1: Update existing ActivityMetrics tests to pass new required param**

In `src/app/core/domain/insights/insights-free.domain.spec.ts`, the `describe('computeActivityMetrics')` block calls `computeActivityMetrics(events, 30, now)` — update **all** those calls to pass `10` as the 4th argument (activeInventory):

```ts
// BEFORE (multiple occurrences):
const result = computeActivityMetrics(events, 30, now);

// AFTER (replace all):
const result = computeActivityMetrics(events, 30, now, 10);
```

Apply to every call inside `describe('computeActivityMetrics')`.

- [ ] **Step 2: Add new rotationRatio tests**

Add inside `describe('computeActivityMetrics')` after the existing tests:

```ts
  describe('rotationRatio', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('is null when activeInventory is 0', () => {
      const result = computeActivityMetrics([], 30, now, 0);
      expect(result.rotationRatio).toBeNull();
    });

    it('is high when consumed / activeInventory >= 0.3', () => {
      const events = Array.from({ length: 6 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 6 consumed / 10 active = 0.6 → high
      const result = computeActivityMetrics(events, 30, now, 10);
      expect(result.rotationRatio).toBe('high');
    });

    it('is medium when consumed / activeInventory is between 0.1 and 0.3', () => {
      const events = Array.from({ length: 2 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 2 consumed / 10 active = 0.2 → medium
      const result = computeActivityMetrics(events, 30, now, 10);
      expect(result.rotationRatio).toBe('medium');
    });

    it('is low when consumed / activeInventory < 0.1', () => {
      const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
      // 1 consumed / 20 active = 0.05 → low
      const result = computeActivityMetrics(events, 30, now, 20);
      expect(result.rotationRatio).toBe('low');
    });
  });
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: TypeScript error — `computeActivityMetrics` called with wrong arg count, and `rotationRatio` not found.

- [ ] **Step 4: Update ActivityMetrics interface and computeActivityMetrics function**

In `src/app/core/domain/insights/insights-free.domain.ts`, replace the `ActivityMetrics` interface and `computeActivityMetrics` function:

```ts
export interface ActivityMetrics {
  added: number;
  consumed: number;
  expired: number;
  wasteRatio: number | null;
  rotationRatio: 'high' | 'medium' | 'low' | null;
  windowDays: number;
}

export function computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date,
  activeInventory: number,
): ActivityMetrics {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  let added = 0;
  let consumed = 0;
  let expired = 0;

  for (const e of recent) {
    if (e.eventType === 'ADD') added += 1;
    else if (e.eventType === 'CONSUME') consumed += 1;
    else if (e.eventType === 'EXPIRE') expired += 1;
  }

  const wasteRatio =
    expired + consumed === 0 ? null : expired / (expired + consumed);

  let rotationRatio: 'high' | 'medium' | 'low' | null = null;
  if (activeInventory > 0) {
    const ratio = consumed / activeInventory;
    if (ratio >= 0.3) rotationRatio = 'high';
    else if (ratio >= 0.1) rotationRatio = 'medium';
    else rotationRatio = 'low';
  }

  return { added, consumed, expired, wasteRatio, rotationRatio, windowDays };
}
```

- [ ] **Step 5: Update activityMetrics computed in InsightsStateService**

In `src/app/core/services/insights/insights-state.service.ts`, update the `activityMetrics` computed:

```ts
// BEFORE:
readonly activityMetrics = computed((): ActivityMetrics =>
  computeActivityMetrics(this.events(), 30, new Date())
);

// AFTER:
readonly activityMetrics = computed((): ActivityMetrics =>
  computeActivityMetrics(this.events(), 30, new Date(), this.inventorySnapshot().active)
);
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts src/app/core/services/insights/insights-state.service.ts
git commit -m "feat(insights-domain): add rotationRatio to ActivityMetrics"
```

---

### Task 4: Update computeDistribution — leastRotatingFoodType + fixed sort order

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`

- [ ] **Step 1: Update existing distribution tests for new sort order**

In `insights-free.domain.spec.ts`, update the test `'returns top food types sorted by count descending'` — after the change, food types follow a FIXED order (PROTEIN first, DAIRY 4th) not by count. Update it:

```ts
// REPLACE the existing 'returns top food types sorted by count descending' test with:
it('returns food types in fixed order (PROTEIN → VEGETABLE → FRUIT → DAIRY → CARB → OTHER)', () => {
  const items = [
    makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
  ];
  const result = computeDistribution(items, [], now, 30);
  // PROTEIN comes before DAIRY in fixed order even though DAIRY has higher count
  expect(result.foodTypes[0].foodType).toBe(FoodType.PROTEIN);
  expect(result.foodTypes[1].foodType).toBe(FoodType.DAIRY);
  expect(result.foodTypes[1].count).toBe(2);
});
```

Note: also rename `result.topFoodTypes` → `result.foodTypes` in ALL other distribution tests in this file.

- [ ] **Step 2: Add leastRotatingFoodType tests**

Add inside `describe('computeDistribution')`:

```ts
  describe('leastRotatingFoodType', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('returns null when no food type has >= 2 active items', () => {
      const items = [
        makeItem({ foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      ];
      const result = computeDistribution(items, [], now, 30);
      expect(result.leastRotatingFoodType).toBeNull();
    });

    it('returns food type with lowest consumed/count ratio (min 2 items)', () => {
      const items = [
        makeItem({ _id: 'p1', foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'p2', foodType: FoodType.PROTEIN, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'd1', foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
        makeItem({ _id: 'd2', foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      ];
      // DAIRY has 0 consumed events → lower rotation than PROTEIN
      const events = [
        makeEvent({ eventType: 'CONSUME', foodType: FoodType.PROTEIN, timestamp: recentTs }),
        makeEvent({ eventType: 'CONSUME', foodType: FoodType.PROTEIN, timestamp: recentTs }),
      ];
      const result = computeDistribution(items, events, now, 30);
      expect(result.leastRotatingFoodType).toBe(FoodType.DAIRY);
    });
  });
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: `foodTypes` property not found, `leastRotatingFoodType` not found.

- [ ] **Step 4: Update DistributionMetrics interface and computeDistribution function**

In `src/app/core/domain/insights/insights-free.domain.ts`, replace the `DistributionMetrics` interface and `computeDistribution` function:

```ts
const FOOD_TYPE_DISPLAY_ORDER: FoodType[] = [
  FoodType.PROTEIN,
  FoodType.VEGETABLE,
  FoodType.FRUIT,
  FoodType.DAIRY,
  FoodType.CARB,
  FoodType.OTHER,
];

export interface DistributionMetrics {
  foodTypes: { foodType: FoodType; count: number }[];
  mostWastedFoodType: FoodType | null;
  leastRotatingFoodType: FoodType | null;
}

export function computeDistribution(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number,
): DistributionMetrics {
  const foodTypeCounts = new Map<FoodType, number>();
  for (const item of items) {
    if (item.productType === 'fresh') continue;
    if (!item.foodType || item.foodType === FoodType.HOUSEHOLD) continue;
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (state === 'expired') continue;
    foodTypeCounts.set(item.foodType, (foodTypeCounts.get(item.foodType) ?? 0) + 1);
  }

  // Fixed display order — "Otros" never first
  const foodTypes = FOOD_TYPE_DISPLAY_ORDER
    .filter(ft => foodTypeCounts.has(ft))
    .map(ft => ({ foodType: ft, count: foodTypeCounts.get(ft)! }));

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  const expiredFoodTypeCounts = new Map<FoodType, number>();
  const consumedByType = new Map<FoodType, number>();

  for (const e of recent) {
    if (!e.foodType || e.foodType === FoodType.HOUSEHOLD) continue;
    if (e.eventType === 'EXPIRE') {
      expiredFoodTypeCounts.set(
        e.foodType as FoodType,
        (expiredFoodTypeCounts.get(e.foodType as FoodType) ?? 0) + 1,
      );
    } else if (e.eventType === 'CONSUME') {
      consumedByType.set(
        e.foodType as FoodType,
        (consumedByType.get(e.foodType as FoodType) ?? 0) + 1,
      );
    }
  }

  const mostWastedFoodType =
    expiredFoodTypeCounts.size === 0
      ? null
      : Array.from(expiredFoodTypeCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

  let leastRotatingFoodType: FoodType | null = null;
  let lowestRatio = Infinity;
  for (const [ft, count] of foodTypeCounts.entries()) {
    if (count < 2) continue;
    const consumed = consumedByType.get(ft) ?? 0;
    const ratio = consumed / count;
    if (ratio < lowestRatio) {
      lowestRatio = ratio;
      leastRotatingFoodType = ft;
    }
  }

  return { foodTypes, mostWastedFoodType, leastRotatingFoodType };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
ng test --include='**/insights-free.domain.spec.ts' --watch=false
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts
git commit -m "feat(insights-domain): add leastRotatingFoodType and fixed food type sort order"
```

---

### Task 5: Update InsightsStateService — new computed signals

**Files:**
- Modify: `src/app/core/services/insights/insights-state.service.ts`

- [ ] **Step 1: Update imports in insights-state.service.ts**

Replace the existing imports from `@core/domain/insights/insights-free.domain` with:

```ts
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
  computePantryScore,
  computeFoodCoverage,
  computePantryHealthState,
  PantryHealthState,
} from '@core/domain/insights/insights-free.domain';
import type {
  ActivityMetrics,
  DistributionMetrics,
  InventorySnapshot,
  PantryScoreResult,
  FoodCoverageResult,
} from '@core/domain/insights/insights-free.domain';
```

- [ ] **Step 2: Add staleCount computed signal**

In `InsightsStateService`, add after `readonly isLoadingEvents`:

```ts
readonly staleCount = computed((): number => {
  const now = Date.now();
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;
  return this.pantryStore.items().filter(item => {
    const qty = (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);
    if (qty <= 0) return false;
    const updated = new Date(item.updatedAt).getTime();
    return !Number.isNaN(updated) && now - updated > STALE_MS;
  }).length;
});
```

- [ ] **Step 3: Add pantryHealthState, pantryScore, foodCoverage signals**

Add after the existing `readonly distribution` computed signal:

```ts
readonly pantryHealthState = computed((): PantryHealthState => {
  const snapshot = this.inventorySnapshot();
  const items = this.pantryStore.items();
  const withDates = items.filter(i => {
    if (i.productType === 'fresh') return false;
    return (i.batches ?? []).some(b => !!b.expirationDate);
  }).length;
  return computePantryHealthState(
    snapshot.expired,
    snapshot.nearExpiry,
    snapshot.total,
    withDates,
    this.staleCount(),
  );
});

readonly pantryScore = computed((): PantryScoreResult | null => {
  const snapshot = this.inventorySnapshot();
  return computePantryScore(
    snapshot.total,
    snapshot.expired,
    snapshot.nearExpiry + snapshot.review,
    snapshot.noExpiryDate,
    snapshot.lowStock,
    this.staleCount(),
  );
});

readonly foodCoverage = computed((): FoodCoverageResult | null => {
  const expiredIds = new Set(
    this.pantryStore.items()
      .filter(i => {
        const state = (i as any)._statusState;
        return state === 'expired';
      })
      .map(i => i._id)
  );
  // Simpler: use snapshot.expired indirectly — filter items not in expired state
  const items = this.pantryStore.items();
  const now = new Date();
  const { getItemStatusState } = require('@core/domain/pantry/pantry-status.domain');
  const { NEAR_EXPIRY_WINDOW_DAYS } = require('@core/constants');
  const activeItems = items.filter(i =>
    getItemStatusState(i, now, NEAR_EXPIRY_WINDOW_DAYS) !== 'expired'
  );
  return computeFoodCoverage(activeItems);
});
```

**NOTE:** The inline `require()` approach above is a placeholder — replace it with proper imports. The correct approach is to import `getItemStatusState` and `NEAR_EXPIRY_WINDOW_DAYS` at the top of the file. Add to the imports:

```ts
import { getItemStatusState } from '@core/domain/pantry/pantry-status.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
```

Then rewrite `foodCoverage`:

```ts
readonly foodCoverage = computed((): FoodCoverageResult | null => {
  const now = new Date();
  const activeItems = this.pantryStore.items().filter(
    i => getItemStatusState(i, now, NEAR_EXPIRY_WINDOW_DAYS) !== 'expired'
  );
  return computeFoodCoverage(activeItems);
});
```

- [ ] **Step 4: Verify the file compiles**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no TS errors related to `insights-state.service.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/insights/insights-state.service.ts
git commit -m "feat(insights): add pantryHealthState, pantryScore, foodCoverage signals"
```

---

### Task 6: Simplify DashboardStateService — remove analytical signals

**Files:**
- Modify: `src/app/core/services/dashboard/dashboard-state.service.ts`

- [ ] **Step 1: Remove analytical imports**

In `dashboard-state.service.ts`, remove from the import list:
- `computeFoodCoverage` from `@core/domain/dashboard`
- `computePantryScore` from `@core/domain/dashboard`
- `getRecentItemsByUpdatedAt` from `@core/domain/dashboard`
- `FoodCoverageResult` type
- `PantryScoreResult` type
- The entire `DashboardInsightService` import line
- `applyBatchEditFilter` from `@core/models/pantry/batch-edit.model` (only used in refreshDashboardInsights)
- `BatchEditStateService` import (only used in `onInsightAction`)

Updated import from `@core/domain/dashboard`:
```ts
import { computeTodaySuggestion } from '@core/domain/dashboard';
import type { TodaySuggestion } from '@core/domain/dashboard';
```

- [ ] **Step 2: Remove analytical signals and methods**

Remove these members from `DashboardStateService`:
- `private readonly insightService = inject(DashboardInsightService);`
- `private readonly batchEdit = inject(BatchEditStateService);`
- `readonly recentlyUpdatedItems` computed
- `readonly pantryScore` computed
- `readonly foodCoverage` computed
- `readonly pantryHealth` computed
- `readonly stalePantryItems` computed
- `readonly stalePantryItemsCount` computed
- `readonly visibleInsights` signal
- `dismissInsight()` method
- `onInsightAction()` method
- `refreshDashboardInsights()` private method
- The `effect()` block that calls `refreshDashboardInsights`

Also remove the `PantryHealthState` enum and `PantryHealth` interface definitions at the top of the file (lines 27–38) — they move to `insights-free.domain.ts`.

Keep `stalePantryItemsCount` referenced in `actions()` computed? Actually check: `stalePantryItemsCount()` IS still used in the `actions()` computed (stale items action). Re-examine: `actions()` uses `this.stalePantryItemsCount()`. So keep `stalePantryItems` and `stalePantryItemsCount` computed signals — only remove from `pantryScore` and `pantryHealth` usage.

Updated removal list (revised):
- Remove `readonly pantryScore` computed
- Remove `readonly foodCoverage` computed
- Remove `readonly pantryHealth` computed  
- Remove `readonly recentlyUpdatedItems` computed
- Remove `readonly visibleInsights` signal
- Remove `private readonly insightService`
- Remove `private readonly batchEdit`
- Remove `dismissInsight()` method
- Remove `onInsightAction()` method
- Remove `refreshDashboardInsights()` private method
- Remove the `effect()` block that calls `refreshDashboardInsights`
- Remove `PantryHealthState` enum and `PantryHealth` interface
- Remove `getHealthIcon()` method

Keep:
- `stalePantryItems` computed (used by `stalePantryItemsCount`)
- `stalePantryItemsCount` computed (used by `actions()`)

- [ ] **Step 3: Verify the file compiles**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no TS errors. If errors exist, they'll point to template references removed in the next task.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/dashboard/dashboard-state.service.ts
git commit -m "refactor(dashboard): remove analytical signals from DashboardStateService"
```

---

### Task 7: Simplify Dashboard template — remove Layers 1 + 4

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.html`
- Modify: `src/app/features/dashboard/dashboard.component.ts`

- [ ] **Step 1: Rewrite dashboard.component.html**

Replace the entire file content with:

```html
<ion-header>
  <ion-toolbar>
    <ion-title>{{ 'dashboard.title' | translate }}</ion-title>
    <ion-buttons slot="end">
      <ion-button [routerLink]="['/settings']" [attr.aria-label]="'settings.title' | translate">
        <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>

<ion-content class="ion-padding">
  <div class="dashboard" [attr.aria-label]="'dashboard.aria' | translate">
    @if (facade.isInitialInventoryLoading()) {
      <section class="dashboard-section">
        <ion-skeleton-text animated style="width: 60%; height: 20px; margin-bottom: 16px;"></ion-skeleton-text>
        <ion-skeleton-text animated style="width: 100%; height: 80px;"></ion-skeleton-text>
      </section>
    } @else {

      <!-- Today's suggestion -->
      @if (facade.totalItems() > 0) {
        <section class="dashboard-section">
          <header class="dashboard-section-header">
            <h3 class="dashboard-section-title">{{ 'dashboard.sections.today.title' | translate }}</h3>
          </header>

          @if (facade.isCookingConfirmed()) {
            <div class="today-card today-card--confirmed">
              <div class="today-card__success-row">
                <ion-icon name="checkmark-circle"></ion-icon>
                <div>
                  <p class="today-card__success-title">{{ 'dashboard.today.success.title' | translate }}</p>
                  <p class="today-card__success-hint">{{ 'dashboard.today.success.hint' | translate }}</p>
                </div>
              </div>
            </div>
          } @else if (!facade.todaySuggestion()) {
            <div class="today-card" [class.today-card--all-good]="!facade.hasLowDataQuality()" [class.today-card--low-data]="facade.hasLowDataQuality()">
              <div class="today-card__all-good-row">
                <ion-icon [name]="facade.hasLowDataQuality() ? 'alert-circle-outline' : 'checkmark-circle-outline'"></ion-icon>
                <div>
                  <p class="today-card__all-good-title">{{ 'dashboard.today.allGood.title' | translate }}</p>
                  @if (facade.hasLowDataQuality()) {
                    <p class="today-card__all-good-hint">
                      {{ 'dashboard.today.allGood.missingDates' | translate:{ count: facade.noExpiryDateCount() } }}
                    </p>
                  } @else if (facade.nextExpiringItem()) {
                    <p class="today-card__all-good-hint">
                      {{ 'dashboard.today.allGood.nextExpiry' | translate:{
                        name: facade.nextExpiringItem()!.name,
                        days: facade.nextExpiringItem()!.daysToExpiry
                      } }}
                    </p>
                  } @else {
                    <p class="today-card__all-good-hint">{{ 'dashboard.today.allGood.hint' | translate }}</p>
                  }
                </div>
              </div>
            </div>
          } @else {
            <div class="today-card">
              <div class="today-card__protagonist">
                <div class="today-card__protagonist-main">
                  <span class="today-card__protagonist-name">{{ facade.todaySuggestion()!.protagonist.name }}</span>
                  @if (facade.todaySuggestion()!.reasonKey !== 'dashboard.today.reason.freshExpiring' && facade.todaySuggestion()!.reasonKey !== 'dashboard.today.reason.freshOut') {
                    <span class="today-card__protagonist-qty">×{{ facade.todaySuggestion()!.protagonist.quantity }}</span>
                  }
                </div>
                @if (facade.todaySuggestion()!.protagonist.expirationDate) {
                  <span class="today-card__protagonist-expiry"
                    [attr.data-urgency]="facade.todaySuggestion()!.protagonist.daysToExpiry !== null
                      ? (facade.todaySuggestion()!.protagonist.daysToExpiry! <= 2 ? 'critical'
                        : facade.todaySuggestion()!.protagonist.daysToExpiry! <= 5 ? 'warning' : 'neutral')
                      : 'neutral'">
                    <ion-icon name="time-outline"></ion-icon>
                    {{ facade.formatExpiryRelative(facade.todaySuggestion()!.protagonist.expirationDate) }}
                  </span>
                }
              </div>
              @if (facade.todaySuggestion()!.protagonist.daysToExpiry === null || facade.todaySuggestion()!.protagonist.daysToExpiry! <= 5) {
                <p class="today-card__reason">{{ facade.todaySuggestion()!.reasonKey | translate: { name: facade.todaySuggestion()!.protagonist.name } }}</p>
              }
              @if (facade.todaySuggestion()!.secondaryItems.length > 0) {
                <p class="today-card__secondary">
                  <span class="today-card__secondary-label">{{ 'dashboard.today.combine' | translate }} </span>@for (item of facade.todaySuggestion()!.secondaryItems; track item.id; let last = $last) {<span class="today-card__secondary-item">{{ item.name }}@if (item.daysToExpiry !== null) { <span class="today-card__secondary-days">· {{ 'dashboard.today.secondary.days' | translate:{ count: item.daysToExpiry } }}</span>}@if (!last) {, }</span>}
                </p>
              }
              <div class="today-card__footer">
                @if (facade.todaySuggestion()!.reasonKey === 'dashboard.today.reason.freshOut') {
                  <ion-button size="small" (click)="facade.dismissToday()">
                    {{ 'dashboard.today.cta.dismiss' | translate }}
                  </ion-button>
                } @else if (facade.todaySuggestion()!.reasonKey === 'dashboard.today.reason.freshExpiring') {
                  <ion-button
                    size="small"
                    [disabled]="facade.isConsumingToday()"
                    (click)="facade.markFreshItemOut(facade.todaySuggestion()!.protagonist.id)">
                    {{ 'dashboard.today.cta.markFreshOut' | translate }}
                  </ion-button>
                } @else {
                  <ion-button
                    size="small"
                    [disabled]="facade.isConsumingToday()"
                    (click)="facade.actOnToday()">
                    {{ 'dashboard.today.cta.primary' | translate }}
                  </ion-button>
                }
                <button class="today-card__dismiss" (click)="facade.dismissToday()">
                  {{ 'dashboard.today.cta.dismiss' | translate }}
                </button>
              </div>
            </div>
          }
        </section>
      }

      <!-- What to do now -->
      @if (facade.actions().length > 0) {
        <section class="dashboard-section">
          <header class="dashboard-section-header">
            <h3 class="dashboard-section-title">{{ 'dashboard.sections.actions.title' | translate }}</h3>
          </header>
          <div class="actions-stack">
            @for (action of facade.actions(); track action.id) {
              <div class="action-card" [attr.data-priority]="action.priority" [attr.data-category]="action.category">
                <div class="action-card__content">
                  <h4 class="action-card__title">{{ action.title }}</h4>
                  <p class="action-card__description">{{ action.description }}</p>
                </div>
                <div class="action-card__footer">
                  <ion-button
                    class="action-card__cta"
                    size="small"
                    [color]="action.category === 'critical' ? 'danger' : action.category === 'preventive' ? 'warning' : 'primary'"
                    (click)="action.cta.action()">
                    {{ action.cta.label }}
                  </ion-button>
                  @if (action.dismissible) {
                    <button class="action-card__dismiss" (click)="facade.dismissAction(action)" aria-label="Dismiss">
                      <ion-icon name="close-outline"></ion-icon>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }
    }
  </div>
</ion-content>

<app-batch-edit-modal></app-batch-edit-modal>
```

- [ ] **Step 2: Update dashboard.component.ts — remove InsightCardComponent**

Replace the imports array in `dashboard.component.ts`:

```ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import { BatchEditModalComponent } from './components/batch-edit-modal/batch-edit-modal.component';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonIcon,
    IonSkeletonText,
    IonButton,
    CommonModule,
    RouterLink,
    TranslateModule,
    BatchEditModalComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  providers: [DashboardStateService],
})
export class DashboardComponent {
  readonly facade = inject(DashboardStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  onSummaryCardClick(card: DashboardOverviewCardId): void {
    void this.facade.onOverviewCardSelected(card);
  }
}
```

- [ ] **Step 3: Build to verify no errors**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/dashboard/dashboard.component.html src/app/features/dashboard/dashboard.component.ts
git commit -m "refactor(dashboard): remove analytical cards (health, score, coverage, insights)"
```

---

### Task 8: Delete DashboardInsightService + insights constants

**Files:**
- Delete: `src/app/core/services/dashboard/dashboard-insight.service.ts`
- Delete: `src/app/core/constants/dashboard/insights.constants.ts`
- Modify: `src/app/core/constants/dashboard/index.ts`

- [ ] **Step 1: Verify nothing else imports these files**

```bash
grep -rn "dashboard-insight.service\|DashboardInsightService\|insights\.constants\|INSIGHTS_LIBRARY" src/app --include="*.ts" | grep -v "spec"
```
Expected: zero results (all usages were removed in Task 6 and Task 7).

If any results appear, remove those usages before continuing.

- [ ] **Step 2: Delete the files**

```bash
rm src/app/core/services/dashboard/dashboard-insight.service.ts
rm src/app/core/constants/dashboard/insights.constants.ts
```

- [ ] **Step 3: Remove re-export from constants barrel**

Open `src/app/core/constants/dashboard/index.ts`. It currently contains:
```ts
export * from './insights.constants';
```
Remove that line. If the file is now empty, delete it or leave it empty.

- [ ] **Step 4: Build to confirm no broken imports**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): delete DashboardInsightService and INSIGHTS_LIBRARY"
```

---

### Task 9: Clean up dashboard.domain.ts

**Files:**
- Modify: `src/app/core/domain/dashboard/dashboard.domain.ts`
- Modify: `src/app/core/services/dashboard/dashboard-state.service.ts`

- [ ] **Step 1: Verify nothing uses the functions being removed**

```bash
grep -rn "computePantryScore\|computeFoodCoverage\|getRecentItemsByUpdatedAt\|PantryScoreResult\|FoodCoverageResult\|PantryScoreLabel\|FoodCoverageUnit" src/app --include="*.ts" | grep -v "spec" | grep -v "insights-free.domain\|insights-state.service"
```
Expected: only `dashboard.domain.ts` itself. If `dashboard-state.service.ts` still appears, the imports were not cleaned up in Task 6 — fix them now.

- [ ] **Step 2: Remove moved functions from dashboard.domain.ts**

Remove from `src/app/core/domain/dashboard/dashboard.domain.ts`:
- `export type PantryScoreLabel`
- `export interface PantryScoreResult`
- `export function computePantryScore(...)`
- `export type FoodCoverageUnit`
- `export interface FoodCoverageResult`
- `const FOOD_TYPE_WEIGHTS`
- `const FOOD_TYPE_COVERAGE_THRESHOLD`
- `export function computeFoodCoverage(...)`
- `export function getRecentItemsByUpdatedAt(...)`
- `export function compareIsoDatesNewestFirst(...)` — only used by `getRecentItemsByUpdatedAt`, remove too

Also remove the unused import `FoodType` from `dashboard.domain.ts` if it is no longer referenced.

- [ ] **Step 3: Remove recentlyUpdatedItems from DashboardStateService**

In `dashboard-state.service.ts`, remove:
```ts
readonly recentlyUpdatedItems = computed(() => getRecentItemsByUpdatedAt(this.pantryItems()));
```
And clean up the import from `@core/domain/dashboard` — it should now only import `computeTodaySuggestion` and `TodaySuggestion`.

- [ ] **Step 4: Build to verify**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/dashboard/dashboard.domain.ts src/app/core/services/dashboard/dashboard-state.service.ts
git commit -m "refactor(dashboard-domain): remove functions moved to insights-free.domain"
```

---

### Task 10: Add new i18n keys (all 6 languages)

**Files:**
- Modify: `src/assets/i18n/en.json`
- Modify: `src/assets/i18n/es.json`
- Modify: `src/assets/i18n/de.json`
- Modify: `src/assets/i18n/fr.json`
- Modify: `src/assets/i18n/it.json`
- Modify: `src/assets/i18n/pt.json`

- [ ] **Step 1: Add new keys to en.json**

Inside the `"insights"` object, make these changes:

**In `"snapshot"`:** add `"noDate": "No date"` (short label for the 4th metric card), and you may remove `"basicsOut"` and `"noExpiry"` if they are no longer used (check Task 11 template first — remove only after template is updated).

**Add new `"status"` key** inside `"insights"`:
```json
"status": {
  "critical": "Expired items detected",
  "attention": "Items need attention",
  "optimal": "Everything looks good"
}
```

**Add new `"coverage"` key** inside `"insights"`:
```json
"coverage": {
  "title": "Estimated coverage"
}
```

**In `"activity"`:** add:
```json
"rotationHigh": "High rotation",
"rotationMedium": "Medium rotation",
"rotationLow": "Low rotation",
"rotationNone": "No activity"
```

**Add new `"quality"` key** inside `"insights"`:
```json
"quality": {
  "title": "Inventory quality",
  "score": "Score",
  "withDate": "Tracked",
  "noDate": "No date",
  "reviewable": "Reviewable",
  "expired": "Expired"
}
```

**In `"distribution"`:** add:
```json
"leastRotating": "Lowest rotation"
```

- [ ] **Step 2: Apply same structure to es.json**

```json
"status": {
  "critical": "Productos caducados detectados",
  "attention": "Hay productos que necesitan atención",
  "optimal": "Todo en orden"
},
"coverage": {
  "title": "Cobertura estimada"
},
"quality": {
  "title": "Calidad del inventario",
  "score": "Puntuación",
  "withDate": "Con seguimiento",
  "noDate": "Sin fecha",
  "reviewable": "Revisables",
  "expired": "Caducados"
}
```

In `"activity"` (es.json):
```json
"rotationHigh": "Rotación alta",
"rotationMedium": "Rotación media",
"rotationLow": "Rotación baja",
"rotationNone": "Sin actividad"
```

In `"distribution"` (es.json):
```json
"leastRotating": "Menor rotación"
```

In `"snapshot"` (es.json):
```json
"noDate": "Sin fecha"
```

- [ ] **Step 3: Apply same structure to de.json**

```json
"status": {
  "critical": "Abgelaufene Produkte erkannt",
  "attention": "Produkte benötigen Aufmerksamkeit",
  "optimal": "Alles in Ordnung"
},
"coverage": { "title": "Geschätzte Reichweite" },
"quality": {
  "title": "Inventarqualität",
  "score": "Bewertung",
  "withDate": "Mit Datum",
  "noDate": "Ohne Datum",
  "reviewable": "Zu prüfen",
  "expired": "Abgelaufen"
},
"snapshot": { "noDate": "Ohne Datum" }
```

In `"activity"` (de.json):
```json
"rotationHigh": "Hohe Rotation",
"rotationMedium": "Mittlere Rotation",
"rotationLow": "Niedrige Rotation",
"rotationNone": "Keine Aktivität"
```

In `"distribution"` (de.json):
```json
"leastRotating": "Geringste Rotation"
```

- [ ] **Step 4: Apply same structure to fr.json**

```json
"status": {
  "critical": "Produits périmés détectés",
  "attention": "Des produits nécessitent attention",
  "optimal": "Tout est en ordre"
},
"coverage": { "title": "Couverture estimée" },
"quality": {
  "title": "Qualité de l'inventaire",
  "score": "Score",
  "withDate": "Suivi",
  "noDate": "Sans date",
  "reviewable": "À vérifier",
  "expired": "Périmés"
},
"snapshot": { "noDate": "Sans date" }
```

In `"activity"` (fr.json):
```json
"rotationHigh": "Rotation élevée",
"rotationMedium": "Rotation moyenne",
"rotationLow": "Rotation faible",
"rotationNone": "Aucune activité"
```

In `"distribution"` (fr.json):
```json
"leastRotating": "Moins de rotation"
```

- [ ] **Step 5: Apply same structure to it.json**

```json
"status": {
  "critical": "Prodotti scaduti rilevati",
  "attention": "Prodotti richiedono attenzione",
  "optimal": "Tutto sotto controllo"
},
"coverage": { "title": "Copertura stimata" },
"quality": {
  "title": "Qualità dell'inventario",
  "score": "Punteggio",
  "withDate": "Tracciati",
  "noDate": "Senza data",
  "reviewable": "Da verificare",
  "expired": "Scaduti"
},
"snapshot": { "noDate": "Senza data" }
```

In `"activity"` (it.json):
```json
"rotationHigh": "Rotazione alta",
"rotationMedium": "Rotazione media",
"rotationLow": "Rotazione bassa",
"rotationNone": "Nessuna attività"
```

In `"distribution"` (it.json):
```json
"leastRotating": "Rotazione minore"
```

- [ ] **Step 6: Apply same structure to pt.json**

```json
"status": {
  "critical": "Produtos expirados detectados",
  "attention": "Produtos precisam de atenção",
  "optimal": "Tudo em ordem"
},
"coverage": { "title": "Cobertura estimada" },
"quality": {
  "title": "Qualidade do inventário",
  "score": "Pontuação",
  "withDate": "Rastreados",
  "noDate": "Sem data",
  "reviewable": "Revisáveis",
  "expired": "Expirados"
},
"snapshot": { "noDate": "Sem data" }
```

In `"activity"` (pt.json):
```json
"rotationHigh": "Rotação alta",
"rotationMedium": "Rotação média",
"rotationLow": "Rotação baixa",
"rotationNone": "Sem atividade"
```

In `"distribution"` (pt.json):
```json
"leastRotating": "Menor rotação"
```

- [ ] **Step 7: Commit**

```bash
git add src/assets/i18n/
git commit -m "feat(i18n): add insights status, coverage, quality, rotation keys (6 languages)"
```

---

### Task 11: Rework Insights template + component helpers

**Files:**
- Modify: `src/app/features/insights/insights.component.ts`
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Step 1: Update insights.component.ts**

Replace the full file content:

```ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  IonButtons,
} from '@ionic/angular/standalone';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { PantryHealthState } from '@core/domain/insights/insights-free.domain';
import { FoodType } from '@core/models/shared/enums.model';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonSkeletonText,
    IonButtons,
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  readonly FoodType = FoodType;
  readonly PantryHealthState = PantryHealthState;

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getQualityBarWidth(count: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((count / total) * 100)}%`;
  }

  getWasteRatioColor(ratio: number | null): string {
    if (ratio === null) return '';
    if (ratio === 0) return 'waste-none';
    if (ratio <= 0.2) return 'waste-low';
    if (ratio <= 0.4) return 'waste-medium';
    return 'waste-high';
  }

  getPantryHealthIcon(state: PantryHealthState): string {
    switch (state) {
      case PantryHealthState.CRITICAL:  return 'alert-circle';
      case PantryHealthState.ATTENTION: return 'warning';
      case PantryHealthState.OPTIMAL:   return 'checkmark-circle';
      default: return 'information-circle';
    }
  }

  getRotationLabel(ratio: 'high' | 'medium' | 'low' | null): string {
    if (ratio === null) return 'insights.activity.rotationNone';
    return `insights.activity.rotation${ratio.charAt(0).toUpperCase()}${ratio.slice(1)}`;
  }

  getMaxFoodTypeCount(): number {
    const foodTypes = this.facade.distribution().foodTypes;
    if (!foodTypes.length) return 0;
    return Math.max(...foodTypes.map(f => f.count));
  }

  getFoodTypeLabel(foodType: FoodType): string {
    const map: Record<FoodType, string> = {
      [FoodType.PROTEIN]:   'Proteínas',
      [FoodType.CARB]:      'Carbohidratos',
      [FoodType.VEGETABLE]: 'Verduras',
      [FoodType.FRUIT]:     'Fruta',
      [FoodType.DAIRY]:     'Lácteos',
      [FoodType.HOUSEHOLD]: 'Hogar',
      [FoodType.OTHER]:     'Otros',
    };
    return map[foodType] ?? foodType;
  }

  readonly proSections = [
    { key: 'patterns',        icon: 'analytics-outline',  labelKey: 'insights.pro.sections.patterns' },
    { key: 'problems',        icon: 'warning-outline',    labelKey: 'insights.pro.sections.problems' },
    { key: 'recommendations', icon: 'bulb-outline',       labelKey: 'insights.pro.sections.recommendations' },
    { key: 'suggestions',     icon: 'calendar-outline',   labelKey: 'insights.pro.sections.suggestions' },
  ] as const;

  getAnalysisSection(key: string): string[] {
    const a = this.facade.proAnalysis();
    if (!a) return [];
    return (a as unknown as Record<string, string[]>)[key] ?? [];
  }
}
```

- [ ] **Step 2: Rewrite insights.component.html**

Replace the full file content:

```html
<ion-header>
  <ion-toolbar>
    <ion-title>{{ 'insights.title' | translate }}</ion-title>
    <ion-buttons slot="end">
      <ion-button [routerLink]="['/settings']" [attr.aria-label]="'settings.title' | translate">
        <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>

<ion-content class="ion-padding">
  <div class="insights">

    @if (facade.isLoadingEvents()) {
      <section class="insights-section">
        <ion-skeleton-text animated style="width: 60%; height: 20px; margin-bottom: 16px;"></ion-skeleton-text>
        <ion-skeleton-text animated style="width: 100%; height: 80px;"></ion-skeleton-text>
      </section>
    } @else {

      <!-- SECTION 1: Status banner -->
      <section class="insights-status-banner"
        [attr.data-state]="facade.pantryHealthState()">
        <ion-icon [name]="getPantryHealthIcon(facade.pantryHealthState())"></ion-icon>
        <span>{{ 'insights.status.' + facade.pantryHealthState() | translate }}</span>
      </section>

      <!-- SECTION 2: Tu despensa ahora -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.snapshot.title' | translate }}</h3>
        <div class="snapshot-grid">
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().active }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.active' | translate }}</span>
          </div>
          <div class="metric-card" [class.metric-card--danger]="facade.inventorySnapshot().expired > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().expired }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.expired' | translate }}</span>
          </div>
          <div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().review > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().review }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.review' | translate }}</span>
          </div>
          <div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().noExpiryDate > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().noExpiryDate }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.noDate' | translate }}</span>
          </div>
        </div>
      </section>

      <!-- SECTION 3: Cobertura estimada -->
      @if (facade.foodCoverage()) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.coverage.title' | translate }}</h3>
          <div class="coverage-card">
            <ion-icon name="calendar-outline"></ion-icon>
            <span class="coverage-card__value">
              {{ (facade.foodCoverage()!.value === 1
                    ? 'dashboard.foodCoverage.' + facade.foodCoverage()!.unit + '_one'
                    : 'dashboard.foodCoverage.' + facade.foodCoverage()!.unit + '_other')
                  | translate:{ count: facade.foodCoverage()!.value } }}
            </span>
            <span class="coverage-card__hint">{{ 'dashboard.foodCoverage.hint' | translate }}</span>
          </div>
        </section>
      }

      <!-- SECTION 4: Últimos 30 días -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.activity.title' | translate }}</h3>
        <div class="activity-row">
          <div class="activity-stat">
            <span class="activity-stat__value">{{ facade.activityMetrics().consumed }}</span>
            <span class="activity-stat__label">{{ 'insights.activity.consumed' | translate }}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat__value">{{ facade.activityMetrics().expired }}</span>
            <span class="activity-stat__label">{{ 'insights.activity.expired' | translate }}</span>
          </div>
          <div class="activity-stat">
            @if (facade.activityMetrics().wasteRatio !== null && facade.activityMetrics().wasteRatio! > 0) {
              <span class="activity-stat__value">{{ formatPercent(facade.activityMetrics().wasteRatio!) }}</span>
            } @else {
              <span class="activity-stat__value">—</span>
            }
            <span class="activity-stat__label">{{ 'insights.activity.wasteRatio' | translate }}</span>
          </div>
        </div>
        <div class="rotation-badge" [attr.data-level]="facade.activityMetrics().rotationRatio">
          <ion-icon name="refresh-outline"></ion-icon>
          <span>{{ getRotationLabel(facade.activityMetrics().rotationRatio) | translate }}</span>
        </div>
      </section>

      <!-- SECTION 5: Por tipo de alimento -->
      @if (facade.distribution().foodTypes.length > 0) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.distribution.title' | translate }}</h3>
          <div class="food-type-bars">
            @for (ft of facade.distribution().foodTypes; track ft.foodType) {
              <div class="food-type-bar">
                <span class="food-type-bar__label">{{ getFoodTypeLabel(ft.foodType) }}</span>
                <div class="food-type-bar__track">
                  <div
                    class="food-type-bar__fill"
                    [style.width]="getBarWidth(ft.count, getMaxFoodTypeCount())">
                  </div>
                </div>
                <span class="food-type-bar__count">{{ ft.count }}</span>
              </div>
            }
          </div>
          <div class="distribution-badges">
            @if (facade.distribution().mostWastedFoodType) {
              <p class="distribution-badge distribution-badge--waste">
                <ion-icon name="alert-circle-outline"></ion-icon>
                {{ 'insights.distribution.mostWasted' | translate }}:
                {{ getFoodTypeLabel(facade.distribution().mostWastedFoodType!) }}
              </p>
            }
            @if (facade.distribution().leastRotatingFoodType) {
              <p class="distribution-badge distribution-badge--rotation">
                <ion-icon name="time-outline"></ion-icon>
                {{ 'insights.distribution.leastRotating' | translate }}:
                {{ getFoodTypeLabel(facade.distribution().leastRotatingFoodType!) }}
              </p>
            }
          </div>
        </section>
      }

      <!-- SECTION 6: Calidad del inventario -->
      @if (facade.inventorySnapshot().total >= 3) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.quality.title' | translate }}</h3>

          @if (facade.pantryScore()) {
            <div class="quality-score" [attr.data-label]="facade.pantryScore()!.label">
              <span class="quality-score__value">{{ facade.pantryScore()!.score }}</span>
              <span class="quality-score__label">
                {{ 'dashboard.pantryScore.' + facade.pantryScore()!.label | translate }}
              </span>
            </div>
          }

          <div class="quality-bars">
            <div class="quality-bar-row">
              <span class="quality-bar-row__label">{{ 'insights.quality.withDate' | translate }}</span>
              <div class="quality-bar-row__track">
                <div class="quality-bar-row__fill quality-bar-row__fill--good"
                  [style.width]="getQualityBarWidth(
                    facade.inventorySnapshot().active - facade.inventorySnapshot().noExpiryDate,
                    facade.inventorySnapshot().total)">
                </div>
              </div>
              <span class="quality-bar-row__pct">
                {{ formatPercent((facade.inventorySnapshot().active - facade.inventorySnapshot().noExpiryDate) / facade.inventorySnapshot().total) }}
              </span>
            </div>
            <div class="quality-bar-row">
              <span class="quality-bar-row__label">{{ 'insights.quality.noDate' | translate }}</span>
              <div class="quality-bar-row__track">
                <div class="quality-bar-row__fill quality-bar-row__fill--warning"
                  [style.width]="getQualityBarWidth(facade.inventorySnapshot().noExpiryDate, facade.inventorySnapshot().total)">
                </div>
              </div>
              <span class="quality-bar-row__pct">
                {{ formatPercent(facade.inventorySnapshot().noExpiryDate / facade.inventorySnapshot().total) }}
              </span>
            </div>
            <div class="quality-bar-row">
              <span class="quality-bar-row__label">{{ 'insights.quality.reviewable' | translate }}</span>
              <div class="quality-bar-row__track">
                <div class="quality-bar-row__fill quality-bar-row__fill--warning"
                  [style.width]="getQualityBarWidth(facade.inventorySnapshot().review, facade.inventorySnapshot().total)">
                </div>
              </div>
              <span class="quality-bar-row__pct">
                {{ formatPercent(facade.inventorySnapshot().review / facade.inventorySnapshot().total) }}
              </span>
            </div>
            <div class="quality-bar-row">
              <span class="quality-bar-row__label">{{ 'insights.quality.expired' | translate }}</span>
              <div class="quality-bar-row__track">
                <div class="quality-bar-row__fill quality-bar-row__fill--danger"
                  [style.width]="getQualityBarWidth(facade.inventorySnapshot().expired, facade.inventorySnapshot().total)">
                </div>
              </div>
              <span class="quality-bar-row__pct">
                {{ formatPercent(facade.inventorySnapshot().expired / facade.inventorySnapshot().total) }}
              </span>
            </div>
          </div>
        </section>
      }

      <!-- SECTION 7: PRO analysis / teaser -->
      @if (facade.isPro()) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.pro.title' | translate }}</h3>

          @if (!facade.proAnalysis() && !facade.proAnalysisLoading() && !facade.proAnalysisError()) {
            <div class="pro-generate">
              <ion-icon name="sparkles-outline" class="pro-generate__icon"></ion-icon>
              <ion-button (click)="facade.triggerProAnalysis()">
                {{ 'insights.pro.generate' | translate }}
              </ion-button>
            </div>
          }

          @if (facade.proAnalysisLoading()) {
            <ion-skeleton-text animated style="width: 100%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 80%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 90%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 60%; height: 14px;"></ion-skeleton-text>
          }

          @if (facade.proAnalysis() && !facade.proAnalysisLoading()) {
            <div class="pro-analysis-header">
              @if (facade.proAnalysisStale()) {
                <span class="pro-analysis-header__stale">{{ 'insights.pro.staleHint' | translate }}</span>
              }
              <button class="pro-analysis-header__refresh"
                (click)="facade.triggerProAnalysis()"
                [disabled]="facade.proAnalysisLoading()">
                <ion-icon name="refresh-outline"></ion-icon>
                {{ 'insights.pro.refresh' | translate }}
              </button>
            </div>
            @for (section of proSections; track section.key) {
              @if (getAnalysisSection(section.key).length > 0) {
                <div class="pro-section">
                  <h4 class="pro-section__title">
                    <ion-icon [name]="section.icon"></ion-icon>
                    {{ section.labelKey | translate }}
                  </h4>
                  <ul class="pro-section__list">
                    @for (item of getAnalysisSection(section.key); track item) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                </div>
              }
            }
          }

          @if (facade.proAnalysisError() && !facade.proAnalysisLoading()) {
            <div class="pro-error">
              <ion-icon name="alert-circle-outline"></ion-icon>
              <span>{{ 'insights.pro.error' | translate }}</span>
              <ion-button size="small" (click)="facade.triggerProAnalysis()">
                {{ 'insights.pro.retry' | translate }}
              </ion-button>
            </div>
          }
        </section>
      } @else {
        <section class="insights-section insights-section--pro-teaser">
          <div class="pro-teaser">
            <div class="pro-teaser__lock">
              <ion-icon name="lock-closed-outline"></ion-icon>
            </div>
            <ion-icon name="sparkles-outline" class="pro-teaser__icon"></ion-icon>
            <h3 class="pro-teaser__title">{{ 'insights.pro.title' | translate }}</h3>
            <p class="pro-teaser__description">{{ 'insights.pro.description' | translate }}</p>
            <ion-button [routerLink]="['/upgrade']" size="small" color="primary">
              {{ 'insights.pro.cta' | translate }}
            </ion-button>
          </div>
        </section>
      }

    }
  </div>
</ion-content>
```

- [ ] **Step 3: Add CSS for new elements to insights.component.scss**

Open `src/app/features/insights/insights.component.scss` and add at the end:

```scss
// Status banner
.insights-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 500;

  &[data-state='critical'] {
    background: rgba(var(--ion-color-danger-rgb), 0.12);
    color: var(--ion-color-danger);
  }
  &[data-state='attention'] {
    background: rgba(var(--ion-color-warning-rgb), 0.12);
    color: var(--ion-color-warning-shade);
  }
  &[data-state='optimal'] {
    background: rgba(var(--ion-color-success-rgb), 0.12);
    color: var(--ion-color-success-shade);
  }
}

// Coverage card
.coverage-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--ion-item-background);
  border-radius: 10px;

  ion-icon { font-size: 22px; color: var(--ion-color-primary); }

  &__value { font-size: 16px; font-weight: 600; flex: 1; }
  &__hint { font-size: 12px; color: var(--ion-color-medium); }
}

// Rotation badge
.rotation-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  background: var(--ion-item-background);
  color: var(--ion-color-medium);

  &[data-level='high']   { background: rgba(var(--ion-color-success-rgb), 0.12); color: var(--ion-color-success-shade); }
  &[data-level='medium'] { background: rgba(var(--ion-color-warning-rgb), 0.12); color: var(--ion-color-warning-shade); }
  &[data-level='low']    { background: rgba(var(--ion-color-danger-rgb),  0.10); color: var(--ion-color-danger); }
}

// Distribution badges
.distribution-badges { margin-top: 12px; }
.distribution-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--ion-color-medium);

  &--waste   { color: var(--ion-color-danger); }
  &--rotation { color: var(--ion-color-warning-shade); }
}

// Quality score
.quality-score {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 16px;

  &__value {
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
  }
  &__label {
    font-size: 14px;
    color: var(--ion-color-medium);
    text-transform: capitalize;
  }

  &[data-label='excellent'] .quality-score__value { color: var(--ion-color-success); }
  &[data-label='good']      .quality-score__value { color: var(--ion-color-success-shade); }
  &[data-label='fair']      .quality-score__value { color: var(--ion-color-warning-shade); }
  &[data-label='poor']      .quality-score__value { color: var(--ion-color-danger); }
}

// Quality bars
.quality-bars { display: flex; flex-direction: column; gap: 10px; }

.quality-bar-row {
  display: grid;
  grid-template-columns: 90px 1fr 40px;
  align-items: center;
  gap: 8px;

  &__label { font-size: 13px; color: var(--ion-color-medium); }
  &__pct   { font-size: 12px; text-align: right; color: var(--ion-color-medium); }

  &__track {
    height: 6px;
    background: var(--ion-color-light-shade);
    border-radius: 3px;
    overflow: hidden;
  }
  &__fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;

    &--good    { background: var(--ion-color-success); }
    &--warning { background: var(--ion-color-warning); }
    &--danger  { background: var(--ion-color-danger); }
  }
}
```

- [ ] **Step 4: Build to verify no errors**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -20
```
Expected: no errors.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
ng test --watch=false 2>&1 | tail -20
```
Expected: all tests PASS (or only pre-existing failures).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/insights/insights.component.ts src/app/features/insights/insights.component.html src/app/features/insights/insights.component.scss
git commit -m "feat(insights): rework tab with 7 sections — status, coverage, quality, rotation, distribution"
```
