# Sub-proyecto B — Insights FREE Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/insights` tab with local deterministic analysis of the pantry — inventory snapshot, 30-day activity from event history, food type distribution, and a locked PRO teaser.

**Architecture:** Domain layer (`insights-free.domain.ts`) holds pure calculation functions tested in isolation. A page-scoped `InsightsStateService` loads events async and exposes computed signals. `InsightsComponent` is a standalone Angular 20 + Ionic 8 component that consumes the service via facade pattern — identical to how `DashboardComponent` works.

**Tech Stack:** Angular 20 standalone components, Ionic 8, TypeScript signals, Karma/Jasmine tests, @ngx-translate i18n (6 languages).

---

## File Map

| File | Action |
|---|---|
| `src/app/core/domain/insights/insights-free.domain.ts` | **Create** — pure calculation functions + interfaces |
| `src/app/core/domain/insights/insights-free.domain.spec.ts` | **Create** — unit tests |
| `src/app/core/services/insights/insights-state.service.ts` | **Create** — page-scoped reactive state |
| `src/app/features/insights/insights.component.ts` | **Create** — tab component |
| `src/app/features/insights/insights.component.html` | **Create** — template |
| `src/app/features/insights/insights.component.scss` | **Create** — styles |
| `src/app/app.routes.ts` | Modify — add `/insights` route |
| `src/app/features/tabs/tabs.component.html` | Modify — add insights tab button |
| `src/assets/i18n/es.json` | Modify — add `insights.*` block |
| `src/assets/i18n/en.json` | Modify — add `insights.*` block |
| `src/assets/i18n/de.json` | Modify — add `insights.*` block |
| `src/assets/i18n/fr.json` | Modify — add `insights.*` block |
| `src/assets/i18n/it.json` | Modify — add `insights.*` block |
| `src/assets/i18n/pt.json` | Modify — add `insights.*` block |

---

## Task 1: Domain — Types + Functions + Tests (TDD)

**Files:**
- Create: `src/app/core/domain/insights/insights-free.domain.ts`
- Create: `src/app/core/domain/insights/insights-free.domain.spec.ts`

### Step 1: Write failing tests

- [ ] Create `src/app/core/domain/insights/insights-free.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
} from './insights-free.domain';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'item-1',
    _rev: '1-abc',
    type: 'item',
    householdId: 'hh1',
    name: 'Test',
    categoryId: 'cat1',
    batches: [],
    productType: 'pantry',
    ...overrides,
  } as PantryItem;
}

function makeEvent(overrides: Partial<PantryEvent> = {}): PantryEvent {
  return {
    _id: 'evt-1',
    _rev: '1-abc',
    type: 'event',
    eventType: 'ADD',
    productId: 'item-1',
    quantity: 1,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as PantryEvent;
}

describe('computeInventorySnapshot', () => {
  const now = new Date('2026-05-14');

  it('counts active items (non-expired)', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.total).toBe(1);
    expect(result.active).toBe(1);
    expect(result.expired).toBe(0);
  });

  it('counts expired items and excludes from active', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-01' }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.expired).toBe(1);
    expect(result.active).toBe(0);
  });

  it('counts review items (dairy expired <7d ago)', () => {
    const items = [
      makeItem({
        foodType: FoodType.DAIRY,
        batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-11' }], // 3d ago
      }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.review).toBe(1);
    expect(result.active).toBe(1); // review is not expired
    expect(result.expired).toBe(0);
  });

  it('counts basics out of stock', () => {
    const items = [
      makeItem({ isBasic: true, batches: [] }),
      makeItem({ isBasic: true, batches: [{ batchId: 'b1', quantity: 1 }] }),
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.basicsOutOfStock).toBe(1);
  });

  it('counts items without expiry date (excluding fresh and noExpiry)', () => {
    const items = [
      makeItem({ batches: [] }), // no date → counted
      makeItem({ productType: 'fresh', batches: [] }), // fresh → not counted
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] }), // noExpiry → not counted
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }), // has date → not counted
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.noExpiryDate).toBe(1);
  });

  it('expiredRatio is 0 when total is 0', () => {
    const result = computeInventorySnapshot([], now);
    expect(result.expiredRatio).toBe(0);
  });

  it('expiredRatio is correct', () => {
    const items = [
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-05-01' }] }), // expired
      makeItem({ batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }), // active
    ];
    const result = computeInventorySnapshot(items, now);
    expect(result.expiredRatio).toBe(0.5);
  });
});

describe('computeActivityMetrics', () => {
  const now = new Date('2026-05-14');
  const recentTs = new Date('2026-04-20').toISOString(); // within 30d
  const oldTs = new Date('2026-03-01').toISOString();    // outside 30d

  it('counts ADD events within window', () => {
    const events = [
      makeEvent({ eventType: 'ADD', timestamp: recentTs }),
      makeEvent({ eventType: 'ADD', timestamp: oldTs }),
    ];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.added).toBe(1);
  });

  it('counts CONSUME events within window', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.consumed).toBe(1);
  });

  it('counts EXPIRE events within window', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.expired).toBe(1);
  });

  it('wasteRatio is null when no consumed or expired', () => {
    const result = computeActivityMetrics([], 30, now);
    expect(result.wasteRatio).toBeNull();
  });

  it('wasteRatio is 0 when consumed > 0 and expired = 0', () => {
    const events = [makeEvent({ eventType: 'CONSUME', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.wasteRatio).toBe(0);
  });

  it('wasteRatio is 1 when expired > 0 and consumed = 0', () => {
    const events = [makeEvent({ eventType: 'EXPIRE', timestamp: recentTs })];
    const result = computeActivityMetrics(events, 30, now);
    expect(result.wasteRatio).toBe(1);
  });
});

describe('computeDistribution', () => {
  const now = new Date('2026-05-14');
  const recentTs = new Date('2026-04-20').toISOString();

  it('returns top food types sorted by count descending', () => {
    const items = [
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.DAIRY, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
      makeItem({ foodType: FoodType.CARB, batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-06-01' }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes[0].foodType).toBe(FoodType.DAIRY);
    expect(result.topFoodTypes[0].count).toBe(2);
  });

  it('excludes HOUSEHOLD from top food types', () => {
    const items = [
      makeItem({ foodType: FoodType.HOUSEHOLD, batches: [{ batchId: 'b1', quantity: 1 }] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes.length).toBe(0);
  });

  it('excludes fresh items from top food types', () => {
    const items = [
      makeItem({ productType: 'fresh', foodType: FoodType.DAIRY, batches: [] }),
    ];
    const result = computeDistribution(items, [], now, 30);
    expect(result.topFoodTypes.length).toBe(0);
  });

  it('mostWastedFoodType returns null when no EXPIRE events with foodType', () => {
    const result = computeDistribution([], [], now, 30);
    expect(result.mostWastedFoodType).toBeNull();
  });

  it('mostWastedFoodType returns most frequent food type from EXPIRE events', () => {
    const events = [
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.DAIRY, timestamp: recentTs }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.DAIRY, timestamp: recentTs }),
      makeEvent({ eventType: 'EXPIRE', foodType: FoodType.CARB, timestamp: recentTs }),
    ];
    const result = computeDistribution([], events, now, 30);
    expect(result.mostWastedFoodType).toBe(FoodType.DAIRY);
  });
});
```

- [ ] **Run tests to confirm they fail:**

```bash
npx ng test --watch=false --include='src/app/core/domain/insights/insights-free.domain.spec.ts' 2>&1 | tail -10
```

Expected: FAILED — `computeInventorySnapshot is not a function` / module not found.

### Step 2: Implement domain

- [ ] Create `src/app/core/domain/insights/insights-free.domain.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';
import { getItemStatusState, sumQuantities } from '@core/domain/pantry';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

export interface InventorySnapshot {
  total: number;
  active: number;
  expired: number;
  review: number;
  nearExpiry: number;
  lowStock: number;
  basicsOutOfStock: number;
  noExpiryDate: number;
  expiredRatio: number;
}

export interface ActivityMetrics {
  added: number;
  consumed: number;
  expired: number;
  wasteRatio: number | null;
  windowDays: number;
}

export interface DistributionMetrics {
  topFoodTypes: { foodType: FoodType; count: number }[];
  mostWastedFoodType: FoodType | null;
}

export function computeInventorySnapshot(items: PantryItem[], now: Date): InventorySnapshot {
  const result: InventorySnapshot = {
    total: items.length,
    active: 0,
    expired: 0,
    review: 0,
    nearExpiry: 0,
    lowStock: 0,
    basicsOutOfStock: 0,
    noExpiryDate: 0,
    expiredRatio: 0,
  };

  for (const item of items) {
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);

    if (state === 'expired') {
      result.expired += 1;
    } else {
      result.active += 1;
      if (state === 'review') result.review += 1;
      else if (state === 'near-expiry') result.nearExpiry += 1;
      else if (state === 'low-stock') result.lowStock += 1;
    }

    if (item.isBasic === true && sumQuantities(item.batches ?? []) === 0) {
      result.basicsOutOfStock += 1;
    }

    if (item.productType !== 'fresh') {
      const hasBatchDate = (item.batches ?? []).some(b => !!b.expirationDate);
      const allMarkedNoExpiry =
        (item.batches ?? []).length > 0 &&
        (item.batches ?? []).every(b => !!b.noExpiry);
      if (!hasBatchDate && !allMarkedNoExpiry) {
        result.noExpiryDate += 1;
      }
    }
  }

  result.expiredRatio = result.total > 0 ? result.expired / result.total : 0;
  return result;
}

export function computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date
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

  return { added, consumed, expired, wasteRatio, windowDays };
}

export function computeDistribution(
  items: PantryItem[],
  events: PantryEvent[],
  now: Date,
  windowDays: number
): DistributionMetrics {
  const foodTypeCounts = new Map<FoodType, number>();
  for (const item of items) {
    if (item.productType === 'fresh') continue;
    if (!item.foodType || item.foodType === FoodType.HOUSEHOLD) continue;
    const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (state === 'expired') continue;
    foodTypeCounts.set(item.foodType, (foodTypeCounts.get(item.foodType) ?? 0) + 1);
  }

  const topFoodTypes = Array.from(foodTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([foodType, count]) => ({ foodType, count }));

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const expiredFoodTypeCounts = new Map<FoodType, number>();
  for (const e of events) {
    if (e.eventType !== 'EXPIRE') continue;
    if (new Date(e.timestamp).getTime() < cutoff) continue;
    if (!e.foodType || e.foodType === FoodType.HOUSEHOLD) continue;
    expiredFoodTypeCounts.set(
      e.foodType as FoodType,
      (expiredFoodTypeCounts.get(e.foodType as FoodType) ?? 0) + 1
    );
  }

  const mostWastedFoodType =
    expiredFoodTypeCounts.size === 0
      ? null
      : Array.from(expiredFoodTypeCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

  return { topFoodTypes, mostWastedFoodType };
}
```

- [ ] **Run tests to confirm they pass:**

```bash
npx ng test --watch=false --include='src/app/core/domain/insights/insights-free.domain.spec.ts' 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Commit:**

```bash
git add src/app/core/domain/insights/
git commit -m "feat(domain): add insights-free domain — snapshot, activity, distribution"
```

---

## Task 2: InsightsStateService

**Files:**
- Create: `src/app/core/services/insights/insights-state.service.ts`

- [ ] **Create the service:**

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryEvent } from '@core/models/events';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
} from '@core/domain/insights/insights-free.domain';
import type { ActivityMetrics, DistributionMetrics, InventorySnapshot } from '@core/domain/insights/insights-free.domain';

export type { ActivityMetrics, DistributionMetrics, InventorySnapshot };

@Injectable()
export class InsightsStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly revenueCat = inject(UpgradeRevenuecatService);

  private readonly events = signal<PantryEvent[]>([]);
  readonly isLoadingEvents = signal(true);

  readonly inventorySnapshot = computed((): InventorySnapshot =>
    computeInventorySnapshot(this.pantryStore.items(), new Date())
  );

  readonly activityMetrics = computed((): ActivityMetrics =>
    computeActivityMetrics(this.events(), 30, new Date())
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(), 30)
  );

  readonly isPro = computed(() => this.revenueCat.isPro());

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.isLoadingEvents.set(true);
    const loaded = await this.eventLog.listEvents();
    this.events.set(loaded);
    this.isLoadingEvents.set(false);
  }
}
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep "insights" | head -10
```

Expected: no errors related to insights files.

- [ ] **Commit:**

```bash
git add src/app/core/services/insights/insights-state.service.ts
git commit -m "feat(service): add InsightsStateService — page-scoped, event-backed signals"
```

---

## Task 3: Route + tab + bare component shell

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/features/tabs/tabs.component.html`
- Create: `src/app/features/insights/insights.component.ts`
- Create: `src/app/features/insights/insights.component.html` (bare shell)
- Create: `src/app/features/insights/insights.component.scss` (empty)

- [ ] **Add route to `app.routes.ts`**

Inside the `children` array of the root TabsComponent route, add after the pantry route:

```ts
      {
        path: 'insights',
        loadComponent: () =>
          import('@features/insights/insights.component').then(m => m.InsightsComponent),
      },
```

- [ ] **Add tab button to `tabs.component.html`**

Insert between the pantry tab and the list tab:

```html
    <ion-tab-button tab="insights" [routerLink]="['/insights']">
      <ion-icon name="analytics-outline"></ion-icon>
      <ion-label>{{ 'insights.tabTitle' | translate }}</ion-label>
    </ion-tab-button>
```

- [ ] **Create bare `insights.component.ts`:**

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
} from '@ionic/angular/standalone';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
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
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  readonly FoodType = FoodType;

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getWasteRatioColor(ratio: number | null): string {
    if (ratio === null) return '';
    if (ratio === 0) return 'waste-none';
    if (ratio <= 0.2) return 'waste-low';
    if (ratio <= 0.4) return 'waste-medium';
    return 'waste-high';
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getFoodTypeKey(foodType: FoodType): string {
    const map: Record<FoodType, string> = {
      [FoodType.PROTEIN]: 'Proteínas',
      [FoodType.CARB]: 'Carbohidratos',
      [FoodType.VEGETABLE]: 'Verduras',
      [FoodType.FRUIT]: 'Fruta',
      [FoodType.DAIRY]: 'Lácteos',
      [FoodType.HOUSEHOLD]: 'Hogar',
      [FoodType.OTHER]: 'Otros',
    };
    return map[foodType] ?? foodType;
  }
}
```

- [ ] **Create bare `insights.component.html`** (placeholder so it builds):

```html
<ion-header>
  <ion-toolbar>
    <ion-title>{{ 'insights.title' | translate }}</ion-title>
  </ion-toolbar>
</ion-header>

<ion-content class="ion-padding">
  <p>Insights FREE — TODO</p>
</ion-content>
```

- [ ] **Create empty `insights.component.scss`:**

```scss
// styles added in Task 6
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts" | head -10
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add src/app/app.routes.ts src/app/features/tabs/tabs.component.html src/app/features/insights/
git commit -m "feat(routing): add /insights route and tab, bare InsightsComponent shell"
```

---

## Task 4: Template — Sección A (Estado actual) + Sección B (Actividad)

**Files:**
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Replace the placeholder HTML with the full template up through Section B:**

```html
<ion-header>
  <ion-toolbar>
    <ion-title>{{ 'insights.title' | translate }}</ion-title>
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

      <!-- SECTION A: Estado actual -->
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
          <div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().basicsOutOfStock > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().basicsOutOfStock }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.basicsOut' | translate }}</span>
          </div>
        </div>
        @if (facade.inventorySnapshot().noExpiryDate > 0) {
          <p class="no-expiry-hint">
            {{ 'insights.snapshot.noExpiry' | translate:{
              count: facade.inventorySnapshot().noExpiryDate,
              total: facade.inventorySnapshot().total
            } }}
          </p>
        }
      </section>

      <!-- SECTION B: Actividad últimos 30 días -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.activity.title' | translate }}</h3>
        <div class="activity-row">
          <div class="activity-stat">
            <span class="activity-stat__value">{{ facade.activityMetrics().added }}</span>
            <span class="activity-stat__label">{{ 'insights.activity.added' | translate }}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat__value">{{ facade.activityMetrics().consumed }}</span>
            <span class="activity-stat__label">{{ 'insights.activity.consumed' | translate }}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat__value">{{ facade.activityMetrics().expired }}</span>
            <span class="activity-stat__label">{{ 'insights.activity.expired' | translate }}</span>
          </div>
        </div>
        <div class="waste-badge" [ngClass]="getWasteRatioColor(facade.activityMetrics().wasteRatio)">
          @if (facade.activityMetrics().wasteRatio === null) {
            <ion-icon name="time-outline"></ion-icon>
            <span>{{ 'insights.activity.noActivity' | translate }}</span>
          } @else if (facade.activityMetrics().wasteRatio === 0) {
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            <span>{{ 'insights.activity.noWaste' | translate }}</span>
          } @else {
            <ion-icon name="warning-outline"></ion-icon>
            <span>
              {{ 'insights.activity.wasteRatio' | translate }}:
              {{ formatPercent(facade.activityMetrics().wasteRatio!) }}
            </span>
          }
        </div>
      </section>

    }
  </div>
</ion-content>
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts" | head -5
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add src/app/features/insights/insights.component.html
git commit -m "feat(template): add insights sections A (snapshot) and B (activity)"
```

---

## Task 5: Template — Sección C (Distribución) + Sección D (PRO teaser)

**Files:**
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Append Sections C and D inside the `@else` block, after Section B, before the closing `}`:**

Add this content after the closing `</section>` of Section B and before `}`:

```html
      <!-- SECTION C: Distribución por tipo de alimento -->
      @if (facade.distribution().topFoodTypes.length > 0) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.distribution.title' | translate }}</h3>
          <div class="food-type-bars">
            @for (ft of facade.distribution().topFoodTypes; track ft.foodType) {
              <div class="food-type-bar">
                <span class="food-type-bar__label">{{ getFoodTypeKey(ft.foodType) }}</span>
                <div class="food-type-bar__track">
                  <div
                    class="food-type-bar__fill"
                    [style.width]="getBarWidth(ft.count, facade.distribution().topFoodTypes[0].count)">
                  </div>
                </div>
                <span class="food-type-bar__count">{{ ft.count }}</span>
              </div>
            }
          </div>
          @if (facade.distribution().mostWastedFoodType) {
            <p class="most-wasted-hint">
              <ion-icon name="alert-circle-outline"></ion-icon>
              {{ 'insights.distribution.mostWasted' | translate }}:
              {{ getFoodTypeKey(facade.distribution().mostWastedFoodType!) }}
            </p>
          }
        </section>
      }

      <!-- SECTION D: PRO teaser (non-PRO only) -->
      @if (!facade.isPro()) {
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
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts" | head -5
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add src/app/features/insights/insights.component.html
git commit -m "feat(template): add insights sections C (distribution) and D (PRO teaser)"
```

---

## Task 6: SCSS

**Files:**
- Modify: `src/app/features/insights/insights.component.scss`

- [ ] **Replace the empty SCSS with full styles:**

```scss
.insights {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.insights-section {
  background: var(--ion-card-background, var(--ion-color-light));
  border-radius: 16px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--ion-text-color) 8%, transparent);

  &__title {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: color-mix(in srgb, var(--ion-text-color) 55%, transparent);
    margin: 0 0 12px;
  }

  &--pro-teaser {
    border: 1px dashed color-mix(in srgb, var(--ion-color-primary) 40%, transparent);
    background: color-mix(in srgb, var(--ion-color-primary) 4%, transparent);
  }
}

// Section A — snapshot grid
.snapshot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ion-text-color) 5%, transparent);
  gap: 4px;

  &__value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
  }

  &__label {
    font-size: 11px;
    text-align: center;
    color: color-mix(in srgb, var(--ion-text-color) 60%, transparent);
  }

  &--warning {
    background: color-mix(in srgb, var(--ion-color-warning) 15%, transparent);
    .metric-card__value { color: var(--ion-color-warning-shade); }
  }

  &--danger {
    background: color-mix(in srgb, var(--ion-color-danger) 12%, transparent);
    .metric-card__value { color: var(--ion-color-danger); }
  }
}

.no-expiry-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: color-mix(in srgb, var(--ion-text-color) 55%, transparent);
}

// Section B — activity
.activity-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: 14px;
}

.activity-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  &__value {
    font-size: 24px;
    font-weight: 700;
  }

  &__label {
    font-size: 11px;
    color: color-mix(in srgb, var(--ion-text-color) 60%, transparent);
  }
}

.waste-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: color-mix(in srgb, var(--ion-text-color) 6%, transparent);

  ion-icon { font-size: 16px; }

  &.waste-none,
  &.waste-low {
    background: color-mix(in srgb, var(--ion-color-success) 12%, transparent);
    color: var(--ion-color-success-shade);
    ion-icon { color: var(--ion-color-success); }
  }

  &.waste-medium {
    background: color-mix(in srgb, var(--ion-color-warning) 15%, transparent);
    color: var(--ion-color-warning-shade);
    ion-icon { color: var(--ion-color-warning); }
  }

  &.waste-high {
    background: color-mix(in srgb, var(--ion-color-danger) 12%, transparent);
    color: var(--ion-color-danger);
    ion-icon { color: var(--ion-color-danger); }
  }
}

// Section C — distribution bars
.food-type-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.food-type-bar {
  display: grid;
  grid-template-columns: 80px 1fr 32px;
  align-items: center;
  gap: 8px;

  &__label {
    font-size: 12px;
    color: color-mix(in srgb, var(--ion-text-color) 80%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__track {
    background: color-mix(in srgb, var(--ion-text-color) 8%, transparent);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    background: var(--ion-color-primary);
    border-radius: 4px;
    transition: width 300ms ease;
  }

  &__count {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
    color: color-mix(in srgb, var(--ion-text-color) 60%, transparent);
  }
}

.most-wasted-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--ion-color-warning-shade);
  ion-icon { font-size: 14px; }
}

// Section D — PRO teaser
.pro-teaser {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 8px 0;

  &__lock {
    position: absolute;
    top: 0;
    right: 0;
    color: color-mix(in srgb, var(--ion-color-primary) 50%, transparent);
    ion-icon { font-size: 18px; }
  }

  &__icon {
    font-size: 36px;
    color: var(--ion-color-primary);
    margin-bottom: 4px;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
  }

  &__description {
    font-size: 13px;
    color: color-mix(in srgb, var(--ion-text-color) 65%, transparent);
    margin: 0;
    line-height: 1.4;
  }
}
```

- [ ] **Commit:**

```bash
git add src/app/features/insights/insights.component.scss
git commit -m "feat(styles): add Insights tab SCSS — grid, bars, waste badge, PRO teaser"
```

---

## Task 7: i18n — 6 languages

**Files:** `src/assets/i18n/{es,en,de,fr,it,pt}.json`

For each file, add a new top-level `"insights"` key. Read each file before editing. Maintain valid JSON (no trailing commas).

- [ ] **Add to `src/assets/i18n/es.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Análisis",
  "snapshot": {
    "title": "Tu despensa ahora",
    "active": "Activos",
    "expired": "Caducados",
    "review": "Revisar",
    "basicsOut": "Básicos sin stock",
    "noExpiry": "Sin fecha: {{count}} de {{total}} productos"
  },
  "activity": {
    "title": "Últimos 30 días",
    "added": "Añadidos",
    "consumed": "Consumidos",
    "expired": "Caducados",
    "wasteRatio": "Desperdicio",
    "noActivity": "Sin actividad registrada",
    "noWaste": "Sin desperdicio"
  },
  "distribution": {
    "title": "Por tipo de alimento",
    "mostWasted": "Más caducados"
  },
  "pro": {
    "title": "Análisis inteligente con IA",
    "description": "Detecta patrones, predice desperdicio y te da recomendaciones personalizadas.",
    "cta": "Ver PRO"
  }
}
```

- [ ] **Add to `src/assets/i18n/en.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Analysis",
  "snapshot": {
    "title": "Your pantry now",
    "active": "Active",
    "expired": "Expired",
    "review": "Check",
    "basicsOut": "Basics out",
    "noExpiry": "No date: {{count}} of {{total}} items"
  },
  "activity": {
    "title": "Last 30 days",
    "added": "Added",
    "consumed": "Consumed",
    "expired": "Expired",
    "wasteRatio": "Waste rate",
    "noActivity": "No activity recorded",
    "noWaste": "No waste"
  },
  "distribution": {
    "title": "By food type",
    "mostWasted": "Most expired"
  },
  "pro": {
    "title": "Smart AI analysis",
    "description": "Detects patterns, predicts waste and gives personalised recommendations.",
    "cta": "See PRO"
  }
}
```

- [ ] **Add to `src/assets/i18n/de.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Analyse",
  "snapshot": {
    "title": "Dein Vorrat jetzt",
    "active": "Aktiv",
    "expired": "Abgelaufen",
    "review": "Prüfen",
    "basicsOut": "Basis leer",
    "noExpiry": "Kein Datum: {{count}} von {{total}} Produkten"
  },
  "activity": {
    "title": "Letzte 30 Tage",
    "added": "Hinzugefügt",
    "consumed": "Verbraucht",
    "expired": "Abgelaufen",
    "wasteRatio": "Verschwendung",
    "noActivity": "Keine Aktivität aufgezeichnet",
    "noWaste": "Kein Verlust"
  },
  "distribution": {
    "title": "Nach Lebensmitteltyp",
    "mostWasted": "Meiste abgelaufen"
  },
  "pro": {
    "title": "Intelligente KI-Analyse",
    "description": "Erkennt Muster, prognostiziert Verluste und gibt persönliche Empfehlungen.",
    "cta": "PRO ansehen"
  }
}
```

- [ ] **Add to `src/assets/i18n/fr.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Analyse",
  "snapshot": {
    "title": "Ton garde-manger",
    "active": "Actifs",
    "expired": "Périmés",
    "review": "Vérifier",
    "basicsOut": "Essentiels vides",
    "noExpiry": "Sans date: {{count}} sur {{total}} produits"
  },
  "activity": {
    "title": "30 derniers jours",
    "added": "Ajoutés",
    "consumed": "Consommés",
    "expired": "Périmés",
    "wasteRatio": "Gaspillage",
    "noActivity": "Aucune activité enregistrée",
    "noWaste": "Aucun gaspillage"
  },
  "distribution": {
    "title": "Par type d'aliment",
    "mostWasted": "Plus périmés"
  },
  "pro": {
    "title": "Analyse IA intelligente",
    "description": "Détecte les tendances, prédit le gaspillage et donne des recommandations personnalisées.",
    "cta": "Voir PRO"
  }
}
```

- [ ] **Add to `src/assets/i18n/it.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Analisi",
  "snapshot": {
    "title": "La tua dispensa ora",
    "active": "Attivi",
    "expired": "Scaduti",
    "review": "Verificare",
    "basicsOut": "Essenziali esauriti",
    "noExpiry": "Senza data: {{count}} su {{total}} prodotti"
  },
  "activity": {
    "title": "Ultimi 30 giorni",
    "added": "Aggiunti",
    "consumed": "Consumati",
    "expired": "Scaduti",
    "wasteRatio": "Spreco",
    "noActivity": "Nessuna attività registrata",
    "noWaste": "Nessuno spreco"
  },
  "distribution": {
    "title": "Per tipo di cibo",
    "mostWasted": "Più scaduti"
  },
  "pro": {
    "title": "Analisi IA intelligente",
    "description": "Rileva schemi, prevede gli sprechi e fornisce raccomandazioni personalizzate.",
    "cta": "Vedi PRO"
  }
}
```

- [ ] **Add to `src/assets/i18n/pt.json`:**

```json
"insights": {
  "tabTitle": "Insights",
  "title": "Análise",
  "snapshot": {
    "title": "A tua despensa agora",
    "active": "Ativos",
    "expired": "Expirados",
    "review": "Verificar",
    "basicsOut": "Básicos sem stock",
    "noExpiry": "Sem data: {{count}} de {{total}} produtos"
  },
  "activity": {
    "title": "Últimos 30 dias",
    "added": "Adicionados",
    "consumed": "Consumidos",
    "expired": "Expirados",
    "wasteRatio": "Desperdício",
    "noActivity": "Sem atividade registada",
    "noWaste": "Sem desperdício"
  },
  "distribution": {
    "title": "Por tipo de alimento",
    "mostWasted": "Mais expirados"
  },
  "pro": {
    "title": "Análise inteligente com IA",
    "description": "Deteta padrões, prevê desperdício e dá recomendações personalizadas.",
    "cta": "Ver PRO"
  }
}
```

- [ ] **Verify all 6 JSON files are valid:**

```bash
for f in src/assets/i18n/*.json; do python3 -c "import json; json.load(open('$f'))" && echo "$f OK"; done
```

Expected: 6 lines each ending with `OK`.

- [ ] **Commit:**

```bash
git add src/assets/i18n/
git commit -m "feat(i18n): add insights tab translations (es/en/de/fr/it/pt)"
```

---

## Task 8: Full test suite + typecheck

- [ ] **Run full test suite:**

```bash
npx ng test --watch=false 2>&1 | tail -5
```

Expected: all tests PASS (count ≥ 17 + new domain tests).

- [ ] **Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts" | head -10
```

Expected: no output (no new errors).

- [ ] **Commit if any fixes needed:**

```bash
git add -p
git commit -m "fix: address any insights tab type or test issues"
```

---

## Self-Review Checklist

- [x] `computeInventorySnapshot` — counts expired, review, nearExpiry, lowStock, basicsOutOfStock, noExpiryDate, expiredRatio
- [x] `computeActivityMetrics` — filters by window, counts ADD/CONSUME/EXPIRE, wasteRatio null/0/fraction
- [x] `computeDistribution` — top 3 foodTypes (excl. fresh + household), mostWastedFoodType from EXPIRE events
- [x] Tests cover all spec-listed cases including boundaries (wasteRatio null, ratio=0, ratio=1)
- [x] `InsightsStateService` page-scoped (no `providedIn`), listed in `providers: [InsightsStateService]`
- [x] Route `/insights` added as child of TabsComponent
- [x] Tab button added (order: Dashboard · Pantry · Insights · List)
- [x] All 4 template sections implemented: snapshot, activity, distribution, PRO teaser
- [x] PRO teaser shown only for non-PRO users (`!facade.isPro()`)
- [x] CSS bars use only width % — no third-party chart libs
- [x] `HistoryEventLogService` and `HistoryEventManagerService` NOT modified
- [x] Dashboard NOT modified
- [x] All 6 i18n files updated, JSON validity verified
- [x] `getFoodTypeKey()` maps all 7 FoodType values (including HOUSEHOLD, though excluded from display)
