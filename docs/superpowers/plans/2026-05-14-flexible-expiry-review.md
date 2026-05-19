# Flexible Expiry — Estado "Revisar" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `review` intermediate state (orange) for pantry items with flexible foodType (dairy/carb) that have passed their expiry date but are within a 7-day grace window, reducing false-positive red alerts.

**Architecture:** `classifyExpiry()` stays untouched. A new `getExpiryModeFromFoodType()` helper in `pantry-status.domain.ts` maps foodType → strict/flexible/ignore. `getItemStatusState()` intercepts `EXPIRED` for flexible pantry items within 7 days and returns `'review'` instead. The `review` state lives only in `ProductStatusState` (UX layer) — no DB enum changes, no data migration.

**Tech Stack:** Angular 20 standalone components, Ionic 8, TypeScript, Karma/Jasmine tests (`ng test`), SCSS, @ngx-translate i18n (6 languages).

---

## File Map

| File | Change |
|---|---|
| `src/app/core/models/pantry/pantry-list.model.ts` | Add `'review'` to `ProductStatusState`, `PantryStatusFilterValue`, `PantrySummaryMeta.statusCounts` |
| `src/app/core/models/pantry/pantry-pipeline.model.ts` | Add `review: boolean` to `PantryFilterState` + default |
| `src/app/core/domain/pantry/pantry-status.domain.ts` | Add `REVIEW_GRACE_DAYS`, `getExpiryModeFromFoodType()`, `getDaysPastExpiry()`, modify `getItemStatusState()` |
| `src/app/core/domain/pantry/pantry-status.domain.spec.ts` | **New** — tests for `getExpiryModeFromFoodType` + `getItemStatusState` review behavior |
| `src/app/core/domain/pantry/pantry-filtering.domain.ts` | Add `review` filter case in `matchesFilters()` |
| `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts` | **New** — tests for `matchesFilters` review filter |
| `src/app/core/services/pantry/pantry-store.service.ts` | Add `reviewItems` computed signal |
| `src/app/core/services/pantry/pantry-state.service.ts` | Add `review` case in `applyStatusFilterPreset()`, `getStatusFilterValue()`, snapshot default |
| `src/app/core/services/pantry/pantry-view-model.service.ts` | `buildSummary()`, `buildFilterChips()`, `getColorClass()`, `getProductStatusMeta()`, `buildExpiryPart()` |
| `src/app/core/services/dashboard/dashboard-state.service.ts` | Pass `reviewItems` into `computePantryScore` as part of `nearExpiry` |
| `src/app/shared/styles/_card-status-bar.scss` | Add `data-status='review'` rule |
| `src/app/features/pantry/components/pantry-detail/pantry-detail.component.scss` | Add `data-status='review'` border rule |
| `src/app/features/pantry/pantry.component.scss` | Add `chip--review` style |
| `src/assets/i18n/es.json` | Add 3 review keys |
| `src/assets/i18n/en.json` | Add 3 review keys |
| `src/assets/i18n/de.json` | Add 3 review keys |
| `src/assets/i18n/fr.json` | Add 3 review keys |
| `src/assets/i18n/it.json` | Add 3 review keys |
| `src/assets/i18n/pt.json` | Add 3 review keys |

---

## Task 1: Update Type Definitions

**Files:**
- Modify: `src/app/core/models/pantry/pantry-list.model.ts`
- Modify: `src/app/core/models/pantry/pantry-pipeline.model.ts`

- [ ] **Step 1: Update `ProductStatusState` and `PantryStatusFilterValue`**

In `src/app/core/models/pantry/pantry-list.model.ts`, replace:

```ts
export type PantryStatusFilterValue = 'all' | 'expired' | 'near-expiry' | 'low-stock' | 'normal';
```

with:

```ts
export type PantryStatusFilterValue = 'all' | 'expired' | 'review' | 'near-expiry' | 'low-stock' | 'normal';
```

Replace:

```ts
export type ProductStatusState = 'normal' | 'near-expiry' | 'expired' | 'low-stock';
```

with:

```ts
export type ProductStatusState = 'normal' | 'near-expiry' | 'review' | 'expired' | 'low-stock';
```

Replace the `statusCounts` block inside `PantrySummaryMeta`:

```ts
  statusCounts: {
    expired: number;
    expiring: number;
    lowStock: number;
    normal: number;
  };
```

with:

```ts
  statusCounts: {
    expired: number;
    expiring: number;
    review: number;
    lowStock: number;
    normal: number;
  };
```

- [ ] **Step 2: Update `PantryFilterState`**

In `src/app/core/models/pantry/pantry-pipeline.model.ts`, replace:

```ts
export interface PantryFilterState {
  lowStock: boolean;
  expired: boolean;
  expiring: boolean;
  recentlyAdded: boolean;
  normalOnly: boolean;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
};
```

with:

```ts
export interface PantryFilterState {
  lowStock: boolean;
  expired: boolean;
  expiring: boolean;
  recentlyAdded: boolean;
  normalOnly: boolean;
  review: boolean;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
  review: false,
};
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (or same errors as before — do not introduce new ones).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/pantry/pantry-list.model.ts \
        src/app/core/models/pantry/pantry-pipeline.model.ts
git commit -m "feat(types): add 'review' to ProductStatusState, PantryStatusFilterValue, PantryFilterState"
```

---

## Task 2: Domain Logic — `getExpiryModeFromFoodType` + `getItemStatusState`

**Files:**
- Modify: `src/app/core/domain/pantry/pantry-status.domain.ts`
- Create: `src/app/core/domain/pantry/pantry-status.domain.spec.ts`

- [ ] **Step 1: Write failing tests first**

Create `src/app/core/domain/pantry/pantry-status.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { getExpiryModeFromFoodType, getItemStatusState } from './pantry-status.domain';
import type { PantryItem } from '@core/models/pantry';

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'test-id',
    _rev: '1-abc',
    type: 'item',
    householdId: 'hh1',
    name: 'Test Item',
    categoryId: 'cat1',
    batches: [],
    productType: 'pantry',
    ...overrides,
  } as PantryItem;
}

function makeBatch(expirationDate: string, quantity = 1) {
  return { batchId: 'b1', quantity, expirationDate };
}

describe('getExpiryModeFromFoodType', () => {
  it('returns flexible for dairy', () => {
    expect(getExpiryModeFromFoodType(FoodType.DAIRY)).toBe('flexible');
  });

  it('returns flexible for carb', () => {
    expect(getExpiryModeFromFoodType(FoodType.CARB)).toBe('flexible');
  });

  it('returns ignore for household', () => {
    expect(getExpiryModeFromFoodType(FoodType.HOUSEHOLD)).toBe('ignore');
  });

  it('returns strict for protein', () => {
    expect(getExpiryModeFromFoodType(FoodType.PROTEIN)).toBe('strict');
  });

  it('returns strict for vegetable', () => {
    expect(getExpiryModeFromFoodType(FoodType.VEGETABLE)).toBe('strict');
  });

  it('returns strict for fruit', () => {
    expect(getExpiryModeFromFoodType(FoodType.FRUIT)).toBe('strict');
  });

  it('returns strict for other', () => {
    expect(getExpiryModeFromFoodType(FoodType.OTHER)).toBe('strict');
  });

  it('returns strict for undefined (safe fallback)', () => {
    expect(getExpiryModeFromFoodType(undefined)).toBe('strict');
  });
});

describe('getItemStatusState — review behavior', () => {
  const windowDays = 15;

  it('returns review for dairy item expired 3 days ago', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11'; // 3 days ago
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('review');
  });

  it('returns review for carb item expired 7 days ago (boundary)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-07'; // exactly 7 days ago
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('review');
  });

  it('returns expired for dairy item expired 8 days ago (past grace)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-06'; // 8 days ago
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns expired immediately for protein item', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-13'; // 1 day ago
    const item = makeItem({
      foodType: FoodType.PROTEIN,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns expired immediately for item without foodType', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11';
    const item = makeItem({
      foodType: undefined,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });

  it('returns normal for household item past expiry date', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-01'; // far past
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('normal');
  });

  it('does NOT return review for fresh items (fresh ignores flexible logic)', () => {
    const now = new Date('2026-05-14');
    const expiry = '2026-05-11'; // 3 days ago
    const item = makeItem({
      productType: 'fresh',
      foodType: FoodType.DAIRY,
      batches: [makeBatch(expiry)],
    });
    expect(getItemStatusState(item, now, windowDays)).toBe('expired');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
ng test --watch=false --include='src/app/core/domain/pantry/pantry-status.domain.spec.ts'
```

Expected: FAILED — `getExpiryModeFromFoodType is not exported` / tests fail on behavior.

- [ ] **Step 3: Implement domain changes**

In `src/app/core/domain/pantry/pantry-status.domain.ts`, add after the existing imports (add `FoodType` import if not present):

```ts
import { FoodType } from '@core/models/shared/enums.model';
```

Add near the top of the file (after other constants):

```ts
export const REVIEW_GRACE_DAYS = 7;

export function getExpiryModeFromFoodType(
  foodType: FoodType | undefined
): 'strict' | 'flexible' | 'ignore' {
  switch (foodType) {
    case FoodType.DAIRY:
    case FoodType.CARB:
      return 'flexible';
    case FoodType.HOUSEHOLD:
      return 'ignore';
    default:
      return 'strict';
  }
}

function getDaysPastExpiry(
  batches: ItemBatch[] | undefined,
  now: Date
): number | null {
  const reference = new Date(now);
  reference.setHours(0, 0, 0, 0);
  const referenceTime = reference.getTime();

  let latestExpiredTime: number | null = null;

  for (const batch of collectBatches(batches)) {
    if (!batch.expirationDate) continue;
    const exp = new Date(batch.expirationDate);
    if (!Number.isFinite(exp.getTime())) continue;
    exp.setHours(0, 0, 0, 0);
    if (exp < reference) {
      if (latestExpiredTime === null || exp.getTime() > latestExpiredTime) {
        latestExpiredTime = exp.getTime();
      }
    }
  }

  if (latestExpiredTime === null) return null;
  return Math.round((referenceTime - latestExpiredTime) / (1000 * 60 * 60 * 24));
}
```

Modify `getItemStatusState()` — replace the existing expired check block:

```ts
// Before (existing code):
  const expirationStatus = computeExpirationStatus(item.batches, now, windowDays);
  if (expirationStatus === ExpirationStatus.EXPIRED) return 'expired';
  if (expirationStatus === ExpirationStatus.NEAR_EXPIRY) return 'near-expiry';
```

with:

```ts
  const expirationStatus = computeExpirationStatus(item.batches, now, windowDays);
  if (expirationStatus === ExpirationStatus.EXPIRED) {
    const mode = getExpiryModeFromFoodType(item.foodType);
    if (mode === 'flexible') {
      const daysPast = getDaysPastExpiry(item.batches, now);
      if (daysPast !== null && daysPast <= REVIEW_GRACE_DAYS) {
        return 'review';
      }
    }
    if (mode === 'ignore') return 'normal';
    return 'expired';
  }
  if (expirationStatus === ExpirationStatus.NEAR_EXPIRY) return 'near-expiry';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
ng test --watch=false --include='src/app/core/domain/pantry/pantry-status.domain.spec.ts'
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/pantry-status.domain.ts \
        src/app/core/domain/pantry/pantry-status.domain.spec.ts
git commit -m "feat(domain): add review state with flexible expiry logic (dairy/carb 7-day grace)"
```

---

## Task 3: Filtering Domain

**Files:**
- Modify: `src/app/core/domain/pantry/pantry-filtering.domain.ts`
- Create: `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { matchesFilters } from './pantry-filtering.domain';
import type { PantryFilterState, PantryItem } from '@core/models/pantry';

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'test-id',
    _rev: '1-abc',
    type: 'item',
    householdId: 'hh1',
    name: 'Test Item',
    categoryId: 'cat1',
    batches: [],
    productType: 'pantry',
    ...overrides,
  } as PantryItem;
}

const noFilters: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
  review: false,
};

describe('matchesFilters — review filter', () => {
  it('passes all items when review filter is false', () => {
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    expect(matchesFilters(item, { ...noFilters, review: false })).toBeTrue();
  });

  it('passes only review-state items when review filter is true', () => {
    const reviewItem = makeItem({
      foodType: FoodType.DAIRY,
      // 3 days expired from today 2026-05-14
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    const expiredItem = makeItem({
      foodType: FoodType.PROTEIN,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }],
    });
    expect(matchesFilters(reviewItem, { ...noFilters, review: true })).toBeTrue();
    expect(matchesFilters(expiredItem, { ...noFilters, review: true })).toBeFalse();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
ng test --watch=false --include='src/app/core/domain/pantry/pantry-filtering.domain.spec.ts'
```

Expected: FAILED — review filter case not yet present.

- [ ] **Step 3: Add review case to `matchesFilters()`**

In `src/app/core/domain/pantry/pantry-filtering.domain.ts`, inside `matchesFilters()`, add after `if (filters.expiring && state !== 'near-expiry') return false;`:

```ts
  if (filters.review && state !== 'review') return false;
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
ng test --watch=false --include='src/app/core/domain/pantry/pantry-filtering.domain.spec.ts'
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/pantry-filtering.domain.ts \
        src/app/core/domain/pantry/pantry-filtering.domain.spec.ts
git commit -m "feat(filter): add review filter case to matchesFilters"
```

---

## Task 4: Store Service + Dashboard Score

**Files:**
- Modify: `src/app/core/services/pantry/pantry-store.service.ts`
- Modify: `src/app/core/services/dashboard/dashboard-state.service.ts`

`pantry-store.service.ts` has `expiredItems` and `nearExpiryItems` computed signals that filter by exact state string. After Task 2, `review` items return `'review'` — not `'expired'` and not `'near-expiry'`. Without this task, review items are invisible to `computePantryScore()` and treated as if they had no issue.

- [ ] **Step 1: Add `reviewItems` computed to `pantry-store.service.ts`**

In `src/app/core/services/pantry/pantry-store.service.ts`, add after `nearExpiryItems`:

```ts
  readonly reviewItems = computed(() => {
    const now = new Date();
    return this.items().filter(item => getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS) === 'review');
  });
```

- [ ] **Step 2: Expose `reviewItems` in `dashboard-state.service.ts`**

In `src/app/core/services/dashboard/dashboard-state.service.ts`, add after `readonly nearExpiryItems = this.pantryStore.nearExpiryItems;`:

```ts
  readonly reviewItems = this.pantryStore.reviewItems;
```

- [ ] **Step 3: Include review count in `computePantryScore` call**

In `dashboard-state.service.ts`, the `pantryScore` computed passes `this.nearExpiryItems().length` as the `nearExpiry` parameter. Replace that call to include review items:

```ts
  readonly pantryScore = computed((): PantryScoreResult | null => {
    return computePantryScore(
      this.totalItems(),
      this.expiredItems().length,
      this.nearExpiryItems().length + this.reviewItems().length,
      this.noExpiryDateCount(),
      this.lowStockItems().length,
      this.stalePantryItemsCount(),
    );
  });
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/pantry/pantry-store.service.ts \
        src/app/core/services/dashboard/dashboard-state.service.ts
git commit -m "feat(store/dashboard): add reviewItems computed, include in pantry score"
```

---

## Task 5: State Service Wiring (pantry-state.service.ts)

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`

- [ ] **Step 1: Update `summarySnapshot` initial value**

At the `summarySnapshot` signal initialization (around line 57), replace:

```ts
statusCounts: { expired: 0, expiring: 0, lowStock: 0, normal: 0 },
```

with:

```ts
statusCounts: { expired: 0, expiring: 0, review: 0, lowStock: 0, normal: 0 },
```

- [ ] **Step 2: Add `review` case to `applyStatusFilterPreset()`**

In `applyStatusFilterPreset()`, add a new `case 'review':` before `default:`:

```ts
      case 'review':
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: true,
        });
        break;
```

Also update all existing `setFilters()` calls to include `review: false` (they now fail TypeScript since the interface has a required `review` field). Update each call:

`case 'expired':` block:
```ts
        this.pantryStore.setFilters({
          expired: true,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
        });
```

`case 'near-expiry':` block:
```ts
        this.pantryStore.setFilters({
          expired: false,
          expiring: true,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
        });
```

`case 'low-stock':` block:
```ts
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: true,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
        });
```

`case 'normal':` block:
```ts
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: true,
          review: false,
        });
```

`default:` block:
```ts
        this.pantryStore.setFilters({
          expired: false,
          expiring: false,
          lowStock: false,
          recentlyAdded: false,
          normalOnly: false,
          review: false,
        });
```

- [ ] **Step 3: Update `getStatusFilterValue()`**

Add `if (filters.review) return 'review';` after `if (filters.expired) return 'expired';`:

```ts
  private getStatusFilterValue(filters: PantryFilterState): PantryStatusFilterValue {
    if (filters.expired) return 'expired';
    if (filters.review) return 'review';
    if (filters.expiring) return 'near-expiry';
    if (filters.lowStock) return 'low-stock';
    if (filters.normalOnly) return 'normal';
    return 'all';
  }
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/pantry/pantry-state.service.ts
git commit -m "feat(state): wire review filter preset and status value mapping"
```

---

## Task 6: ViewModel Service

**Files:**
- Modify: `src/app/core/services/pantry/pantry-view-model.service.ts`

- [ ] **Step 1: Update `buildSummary()` to count review items**

In `buildSummary()`, replace the `statusCounts` initialization and switch:

```ts
    const statusCounts = {
      expired: 0,
      expiring: 0,
      review: 0,
      lowStock: 0,
      normal: 0,
    };
    for (const item of items) {
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      switch (state) {
        case 'expired':
          statusCounts.expired += 1;
          break;
        case 'near-expiry':
          statusCounts.expiring += 1;
          break;
        case 'review':
          statusCounts.review += 1;
          break;
        case 'low-stock':
          statusCounts.lowStock += 1;
          break;
        default:
          statusCounts.normal += 1;
          break;
      }
    }
```

- [ ] **Step 2: Add `review` chip to `buildFilterChips()`**

In `buildFilterChips()`, insert the new chip between the expiring chip and the expired chip:

```ts
      {
        key: 'status-review',
        kind: 'status',
        value: 'review',
        label: 'pantry.filters.status.review',
        count: counts.review,
        icon: 'eye-outline',
        description: 'pantry.filters.desc.review',
        colorClass: 'chip--review',
        active: activeStatus === 'review',
      },
```

The final chip order must be: `status-all`, `status-normal`, `status-low`, `status-expiring`, `status-review`, `status-expired`.

- [ ] **Step 3: Update `getColorClass()`**

Add case before `default`:

```ts
      case 'review':
        return 'state-review';
```

- [ ] **Step 4: Update `getProductStatusMeta()`**

Add case before `default`:

```ts
      case 'review':
        return {
          state,
          label: this.translate.instant('pantry.filters.status.review'),
          accentColor: 'var(--ion-color-warning-shade)',
        };
```

- [ ] **Step 5: Update `buildExpiryPart()`**

Add after `if (state === 'expired') return ...`:

```ts
    if (state === 'review') return this.translate.instant('pantry.detail.subinfo.review');
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/pantry/pantry-view-model.service.ts
git commit -m "feat(viewmodel): add review state to summary, chips, color, meta, subinfo"
```

---

## Task 7: Styles

**Files:**
- Modify: `src/app/shared/styles/_card-status-bar.scss`
- Modify: `src/app/features/pantry/components/pantry-detail/pantry-detail.component.scss`
- Modify: `src/app/features/pantry/pantry.component.scss`

- [ ] **Step 1: Update shared status bar mixin**

In `src/app/shared/styles/_card-status-bar.scss`, add after the existing `near-expiry`/`low-stock` rule:

```scss
  &[data-status='review']                       { --status-bar-color: var(--ion-color-warning-shade); }
```

Full updated mixin (for clarity):

```scss
  &[data-status='expired']                      { --status-bar-color: var(--ion-color-danger);  }
  &[data-status='near-expiry'],
  &[data-status='low-stock']                    { --status-bar-color: var(--ion-color-warning); }
  &[data-status='review']                       { --status-bar-color: var(--ion-color-warning-shade); }
```

- [ ] **Step 2: Update pantry-detail card border**

In `src/app/features/pantry/components/pantry-detail/pantry-detail.component.scss`, add after the existing `near-expiry`/`low-stock` border rule:

```scss
  &[data-status='review']                       { border-color: color-mix(in srgb, var(--ion-color-warning-shade) 28%, transparent); }
```

- [ ] **Step 3: Add chip--review style**

In `src/app/features/pantry/pantry.component.scss`, add after `chip--expiring`:

```scss
.summary-chips .status-chip.chip--review {
  --background: var(--ion-color-warning-shade);
  --color: var(--ion-color-dark);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/styles/_card-status-bar.scss \
        src/app/features/pantry/components/pantry-detail/pantry-detail.component.scss \
        src/app/features/pantry/pantry.component.scss
git commit -m "feat(styles): add orange review state styles to status bar, card border, chip"
```

---

## Task 8: i18n — All 6 Languages

**Files:**
- Modify: `src/assets/i18n/es.json`
- Modify: `src/assets/i18n/en.json`
- Modify: `src/assets/i18n/de.json`
- Modify: `src/assets/i18n/fr.json`
- Modify: `src/assets/i18n/it.json`
- Modify: `src/assets/i18n/pt.json`

- [ ] **Step 1: Add keys to `es.json`**

In `src/assets/i18n/es.json`, under `pantry.filters.status`, add:

```json
"review": "Revisar"
```

Under `pantry.filters.desc`, add:

```json
"review": "Pasó la fecha, pero puede estar bien"
```

Under `pantry.detail.subinfo`, add:

```json
"review": "Consumir pronto"
```

- [ ] **Step 2: Add keys to `en.json`**

Under `pantry.filters.status`: `"review": "Check"`

Under `pantry.filters.desc`: `"review": "Past date, may still be fine"`

Under `pantry.detail.subinfo`: `"review": "Use soon"`

- [ ] **Step 3: Add keys to `de.json`**

Under `pantry.filters.status`: `"review": "Prüfen"`

Under `pantry.filters.desc`: `"review": "Datum überschritten, evtl. noch gut"`

Under `pantry.detail.subinfo`: `"review": "Bald verbrauchen"`

- [ ] **Step 4: Add keys to `fr.json`**

Under `pantry.filters.status`: `"review": "Vérifier"`

Under `pantry.filters.desc`: `"review": "Date dépassée, peut encore être bon"`

Under `pantry.detail.subinfo`: `"review": "À consommer vite"`

- [ ] **Step 5: Add keys to `it.json`**

Under `pantry.filters.status`: `"review": "Verificare"`

Under `pantry.filters.desc`: `"review": "Data superata, potrebbe essere ok"`

Under `pantry.detail.subinfo`: `"review": "Consumare presto"`

- [ ] **Step 6: Add keys to `pt.json`**

Under `pantry.filters.status`: `"review": "Verificar"`

Under `pantry.filters.desc`: `"review": "Passou a data, pode ainda estar bom"`

Under `pantry.detail.subinfo`: `"review": "Consumir em breve"`

- [ ] **Step 7: Commit**

```bash
git add src/assets/i18n/
git commit -m "feat(i18n): add review state translations (es/en/de/fr/it/pt)"
```

---

## Task 9: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
ng test --watch=false
```

Expected: all tests pass. If TypeScript errors appear in the test run, fix them before proceeding.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: address review state type errors found in full test run"
```

---

## Self-Review Checklist

- [x] `getExpiryModeFromFoodType` exported and tested for all 8 cases (7 foodType values + undefined)
- [x] `getDaysPastExpiry` tested indirectly via `getItemStatusState` (private, not exported)
- [x] Grace boundary tested: day 7 = review, day 8 = expired
- [x] Fresh items tested: dairy fresh item → expired (not review)
- [x] Household tested: past expiry → normal
- [x] `matchesFilters` review filter tested
- [x] `applyStatusFilterPreset` updated for all existing presets (review: false added)
- [x] `getStatusFilterValue` updated
- [x] `summarySnapshot` initial value updated
- [x] All 3 SCSS files updated
- [x] All 6 i18n files updated with 3 keys each
- [x] No new files created (spec files are acceptable additions)
- [x] No changes to `classifyExpiry()` signature or behavior
- [x] No changes to `ExpirationStatus` enum
- [x] Dashboard `computePantryScore` caller note: the service building dashboard stats must pass `review` items as part of `nearExpiry` count — verify in the dashboard state service that `review` items are not accidentally counted as `normal` when computing the score
