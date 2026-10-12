# Insights Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Insights from 6 sections to 4 (Desperdicio, Cobertura, Rotación, Clasificación),
each carrying a colored status pill (verde/ámbar/rojo) plus a plain-language sentence, so the
user can tell "am I doing well or not?" at a glance instead of reading raw numbers.

**Architecture:** Two new pure classifier functions in `core/domain/insights` (waste level,
coverage level — rotation reuses an existing classifier); one new tiny presentational shared
component (`app-insight-status-pill`) that renders a level as a colored pill; the two dead
sections ("Tu despensa ahora", "Calidad del inventario") and their backing domain functions
are deleted outright, not just hidden.

**Tech Stack:** Angular 20 standalone components, signals, `@ngx-translate/core`, SCSS with
the app's CSS custom-property design tokens (`--app-theme-*`).

Design doc: `docs/superpowers/specs/2026-09-29-insights-redesign-design.md`.

---

## Before you start

Run from the repo root (`/Users/fernandodelolmomartin/Repos/pantry-manager`), on branch
`release/5.6`. Confirm clean tree first:

```bash
git status --short
```

If anything is uncommitted that isn't yours, stop and ask — don't touch it.

---

### Task 1: `classifyWasteLevel` — pure domain function

**Files:**
- Modify: `src/app/core/domain/insights/waste.domain.ts`
- Test: `src/app/core/domain/insights/waste.domain.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/core/domain/insights/waste.domain.spec.ts` (after the existing
`describe('computeWasteSummary', ...)` block, so add this as a new top-level `describe`
at the end of the file):

```ts
describe('classifyWasteLevel', () => {
  it('is good when nothing expired', () => {
    expect(classifyWasteLevel(0)).toBe('good');
  });

  it('is normal for 1-2 expired products', () => {
    expect(classifyWasteLevel(1)).toBe('normal');
    expect(classifyWasteLevel(2)).toBe('normal');
  });

  it('is bad for 3 or more expired products', () => {
    expect(classifyWasteLevel(3)).toBe('bad');
    expect(classifyWasteLevel(10)).toBe('bad');
  });
});
```

Update the top import in the same file to add `classifyWasteLevel`:

```ts
import { computeWasteSummary, classifyWasteLevel } from './waste.domain';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/waste.domain.spec.ts'`
Expected: FAIL — `classifyWasteLevel is not defined` (or a TS compile error naming it).

- [ ] **Step 3: Implement `classifyWasteLevel`**

Append to the end of `src/app/core/domain/insights/waste.domain.ts`:

```ts
export type WasteLevel = 'good' | 'normal' | 'bad';

/**
 * Free-tier status pill for the waste card. No trend needed (that's PRO) —
 * just today's absolute count. Thresholds are a starting estimate, not
 * derived from real usage data yet; revisit once PostHog exports exist.
 */
export function classifyWasteLevel(totalCount: number): WasteLevel {
  if (totalCount === 0) return 'good';
  if (totalCount <= 2) return 'normal';
  return 'bad';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/waste.domain.spec.ts'`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/insights/waste.domain.ts src/app/core/domain/insights/waste.domain.spec.ts
git commit -m "feat(insights): add classifyWasteLevel for the waste status pill"
```

---

### Task 2: `classifyCoverageLevel` — pure domain function

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Test: `src/app/core/domain/insights/insights-free.domain.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/core/domain/insights/insights-free.domain.spec.ts`, as a new top-level
`describe` at the end of the file (after `describe('computeFoodCoverage', ...)`):

```ts
describe('classifyCoverageLevel', () => {
  it('is bad below 3 days', () => {
    expect(classifyCoverageLevel(0)).toBe('bad');
    expect(classifyCoverageLevel(2)).toBe('bad');
  });

  it('is normal between 3 and 7 days', () => {
    expect(classifyCoverageLevel(3)).toBe('normal');
    expect(classifyCoverageLevel(7)).toBe('normal');
  });

  it('is good above 7 days', () => {
    expect(classifyCoverageLevel(8)).toBe('good');
    expect(classifyCoverageLevel(30)).toBe('good');
  });
});
```

Add `classifyCoverageLevel` to the top import in the same file (the import currently
reads `computeActivityMetrics, computeDistribution, computeInventorySnapshot,
computePantryScore, computeFoodCoverage` — Task 3 below removes the two Inventory/PantryScore
names from this same import; for now just add the new one):

```ts
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
  computePantryScore,
  computeFoodCoverage,
  classifyCoverageLevel,
} from './insights-free.domain';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/insights-free.domain.spec.ts'`
Expected: FAIL — `classifyCoverageLevel is not defined`.

- [ ] **Step 3: Implement `classifyCoverageLevel`**

Append to the end of `src/app/core/domain/insights/insights-free.domain.ts` (after
`computeFoodCoverage`'s closing `}`):

```ts

export type CoverageLevel = 'good' | 'normal' | 'bad';

/**
 * Same caveat as classifyWasteLevel: reasonable starting thresholds, not
 * derived from real data yet.
 */
export function classifyCoverageLevel(days: number): CoverageLevel {
  if (days < 3) return 'bad';
  if (days <= 7) return 'normal';
  return 'good';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/insights-free.domain.spec.ts'`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts
git commit -m "feat(insights): add classifyCoverageLevel for the coverage status pill"
```

---

### Task 3: Delete "Tu despensa ahora" / "Calidad del inventario" — domain and facade together

Do this **before** touching the template (Task 6), so the codebase is never left with a UI
section pointing at deleted code. Domain deletion and facade update are **one task, one
commit**: `insights-state.service.ts` is the only caller of `computeInventorySnapshot` /
`computePantryScore` (confirmed by grep during planning), so deleting the domain functions
without updating the facade in the same pass would leave `ng build` broken between commits —
don't split this into two commits.

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`
- Modify: `src/app/core/services/insights/insights-state.service.ts`

- [ ] **Step 1: Delete `InventorySnapshot` and `computeInventorySnapshot`**

In `src/app/core/domain/insights/insights-free.domain.ts`, delete the `InventorySnapshot`
interface (lines 9–21) and the `computeInventorySnapshot` function (lines 45–95, i.e. from
`export function computeInventorySnapshot(...)` through its closing `}`, plus the blank
line right after it). Leave `ActivityMetrics` (the interface right after `InventorySnapshot`)
and everything from `computeActivityMetrics` onward untouched.

- [ ] **Step 2: Delete `PantryScoreLabel`, `PantryScoreResult`, `computePantryScore`**

In the same file, delete the whole "Pantry Score" block: from the comment
`// ─── Pantry Score ─────...` through `computePantryScore`'s closing `}` (this is the block
immediately before the `// ─── Food Coverage ────...` comment). Leave the Food Coverage
section untouched.

- [ ] **Step 3: Fix the now-unused imports**

At the top of the file, `hasMissingExpiry` and `isIncomplete` were only used inside
`computeInventorySnapshot` — remove them from the import:

```ts
import { getItemStatusState, sumQuantities } from '@core/domain/pantry';
```

(`getItemStatusState` and `sumQuantities` are still used elsewhere in this file — keep them.)

- [ ] **Step 4: Delete the matching spec blocks**

In `src/app/core/domain/insights/insights-free.domain.spec.ts`:
- Delete the whole `describe('computeInventorySnapshot', ...)` block (immediately after
  `describe('computeDistribution — display order', ...)`, immediately before
  `describe('computeActivityMetrics', ...)`).
- Delete the whole `describe('computePantryScore', ...)` block (immediately after
  `describe('computeDistribution', ...)`, immediately before `describe('computeFoodCoverage', ...)`).
- In the top import, remove `computeInventorySnapshot` and `computePantryScore` (this is the
  edit mentioned as pending in Task 2 — do it now):

```ts
import {
  computeActivityMetrics,
  computeDistribution,
  computeFoodCoverage,
  classifyCoverageLevel,
} from './insights-free.domain';
```

- [ ] **Step 5: Run the domain test suite for this folder**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/insights/*.spec.ts'`
Expected: PASS, no failures, no "cannot find name" errors. (`ng build` would still fail at
this point — `insights-state.service.ts` hasn't been updated yet. That's expected; the next
steps fix it before this task's single commit.)

Now update the facade that was the only caller of what Steps 1–2 just deleted:

- [ ] **Step 6: Fix the domain imports in `insights-state.service.ts`**

Find this block near the top of the file:

```ts
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
  computePantryScore,
  computeFoodCoverage,
} from '@core/domain/insights/insights-free.domain';
import type {
  ActivityMetrics,
  DistributionMetrics,
  InventorySnapshot,
  PantryScoreResult,
  FoodCoverageResult,
} from '@core/domain/insights/insights-free.domain';
```

Replace it with:

```ts
import {
  computeActivityMetrics,
  computeDistribution,
  computeFoodCoverage,
  classifyCoverageLevel,
} from '@core/domain/insights/insights-free.domain';
import type {
  ActivityMetrics,
  DistributionMetrics,
  FoodCoverageResult,
  CoverageLevel,
} from '@core/domain/insights/insights-free.domain';
```

A few lines below, find:

```ts
import { computeWasteSummary, type WasteSummary } from '@core/domain/insights/waste.domain';
```

Replace it with:

```ts
import { computeWasteSummary, classifyWasteLevel, type WasteSummary, type WasteLevel } from '@core/domain/insights/waste.domain';
```

- [ ] **Step 7: Fix the re-export line**

Find:

```ts
export type { ActivityMetrics, DistributionMetrics, InventorySnapshot, WasteSummary, RepositionPrediction };
```

Replace it with:

```ts
export type { ActivityMetrics, DistributionMetrics, WasteSummary, RepositionPrediction, CoverageLevel, WasteLevel };
```

- [ ] **Step 8: Delete the `inventorySnapshot` and `pantryScore` computeds**

Find and delete this block:

```ts
  readonly inventorySnapshot = computed((): InventorySnapshot =>
    computeInventorySnapshot(this.pantryStore.items(), new Date(this.clock.now()))
  );

  readonly activityMetrics = computed((): ActivityMetrics =>
    computeActivityMetrics(this.events(), 30, new Date(this.clock.now()))
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(this.clock.now()), 30)
  );

  readonly pantryScore = computed((): PantryScoreResult | null => {
    const snapshot = this.inventorySnapshot();
    return computePantryScore(snapshot.total, snapshot.pendientes);
  });

  readonly foodCoverage = computed((): FoodCoverageResult | null => {
    const now = new Date(this.clock.now());
    const activeItems = this.pantryStore.items().filter(
      i => getItemStatusState(i, now, NEAR_EXPIRY_WINDOW_DAYS) !== 'expired'
    );
    return computeFoodCoverage(activeItems, this.householdSize(), now);
  });
```

Replace it with (keeps `activityMetrics`, `distribution`, `foodCoverage` as they were —
only `inventorySnapshot` and `pantryScore` are gone — and adds `coverageLevel` right after
`foodCoverage`, which it derives from):

```ts
  readonly activityMetrics = computed((): ActivityMetrics =>
    computeActivityMetrics(this.events(), 30, new Date(this.clock.now()))
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(this.clock.now()), 30)
  );

  readonly foodCoverage = computed((): FoodCoverageResult | null => {
    const now = new Date(this.clock.now());
    const activeItems = this.pantryStore.items().filter(
      i => getItemStatusState(i, now, NEAR_EXPIRY_WINDOW_DAYS) !== 'expired'
    );
    return computeFoodCoverage(activeItems, this.householdSize(), now);
  });

  readonly coverageLevel = computed((): CoverageLevel | null => {
    const coverage = this.foodCoverage();
    return coverage ? classifyCoverageLevel(coverage.days) : null;
  });
```

- [ ] **Step 9: Add `wasteLevel`**

Find:

```ts
  readonly wasteSummary = computed<WasteSummary>(() =>
    computeWasteSummary(this.events(), new Date(this.clock.now()), 30)
  );
```

Replace it with:

```ts
  readonly wasteSummary = computed<WasteSummary>(() =>
    computeWasteSummary(this.events(), new Date(this.clock.now()), 30)
  );

  readonly wasteLevel = computed((): WasteLevel => classifyWasteLevel(this.wasteSummary().totalCount));
```

- [ ] **Step 10: Verify the whole task together**

```bash
npx ng lint
npx ng test --watch=false --browsers=ChromeHeadless --include='**/insights/*.spec.ts'
npx ng build --configuration production
```

Expected: lint 0 errors, tests pass, build succeeds — this is the point where `ng build`
must be green again after being expected-broken since Step 5.

- [ ] **Step 11: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts src/app/core/services/insights/insights-state.service.ts
git commit -m "refactor(insights): delete computeInventorySnapshot/computePantryScore

Both only backed the two Insights sections this redesign removes (Tu
despensa ahora, Calidad del inventario) — confirmed no other caller
anywhere in the app. Domain deletion and the facade update that stops
calling them land in one commit; splitting them would leave a commit
where ng build doesn't pass. Also adds coverageLevel/wasteLevel, the
two new computeds the redesigned cards read from."
```

---

### Task 4: `app-insight-status-pill` — new shared component

**Files:**
- Create: `src/app/shared/components/insight-status-pill/insight-status-pill.component.ts`
- Create: `src/app/shared/components/insight-status-pill/insight-status-pill.component.html`
- Create: `src/app/shared/components/insight-status-pill/insight-status-pill.component.scss`

No spec file — matches the existing convention for `shared/components` (none of the 13
current ones have one; presentational, no logic to unit-test).

- [ ] **Step 1: Create the component class**

`src/app/shared/components/insight-status-pill/insight-status-pill.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export type InsightPillLevel = 'good' | 'normal' | 'bad';

/**
 * Small colored pill (verde/ámbar/rojo) used next to an Insights headline
 * number to answer "is this good or bad?" at a glance. Purely
 * presentational — callers resolve the level via a domain classifier
 * (e.g. classifyWasteLevel) and pass it in already decided.
 */
@Component({
  selector: 'app-insight-status-pill',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insight-status-pill.component.html',
  styleUrl: './insight-status-pill.component.scss',
})
export class InsightStatusPillComponent {
  readonly level = input.required<InsightPillLevel>();
  readonly labelKey = input.required<string>();
}
```

- [ ] **Step 2: Create the template**

`src/app/shared/components/insight-status-pill/insight-status-pill.component.html`:

```html
<span class="insight-pill" [attr.data-level]="level()">{{ labelKey() | translate }}</span>
```

- [ ] **Step 3: Create the styles**

`src/app/shared/components/insight-status-pill/insight-status-pill.component.scss`:

```scss
.insight-pill {
  display: inline-block;
  font-size: var(--app-theme-font-size-tiny);
  font-weight: var(--app-theme-font-weight-bold);
  padding: 3px 10px;
  border-radius: var(--app-theme-radius-circle);
  white-space: nowrap;

  &[data-level='good'] {
    background: color-mix(in srgb, var(--ion-color-success) 18%, transparent);
    color: var(--app-theme-success-deep);
  }

  &[data-level='normal'] {
    background: color-mix(in srgb, var(--ion-color-warning) 18%, transparent);
    color: var(--app-theme-warning-deep);
  }

  &[data-level='bad'] {
    background: color-mix(in srgb, var(--ion-color-danger) 18%, transparent);
    color: var(--ion-color-danger);
  }
}
```

- [ ] **Step 4: Verify it builds**

Run: `npx ng build --configuration production 2>&1 | tail -20`
Expected: no new errors (the component isn't used by anything yet, so this just confirms
the 3 new files are syntactically valid and picked up by the build).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/insight-status-pill/
git commit -m "feat(insights): add app-insight-status-pill shared component"
```

---

### Task 5: Wire the pill into the waste card

**Files:**
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.ts`
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.html`
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.scss`

- [ ] **Step 1: Add the level computed and import the pill component**

In `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.ts`, add the
import and a `level` computed:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { classifyWasteLevel, type WasteSummary } from '@core/domain/insights/waste.domain';
import { formatFriendlyName } from '@core/utils/normalization.util';
import { InsightStatusPillComponent } from '@shared/components/insight-status-pill/insight-status-pill.component';

@Component({
  selector: 'app-waste-tracker-card',
  standalone: true,
  imports: [
    TranslateModule,
    RouterLink,
    IonIcon,
    InsightStatusPillComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-tracker-card.component.html',
  styleUrl: './waste-tracker-card.component.scss',
})
export class WasteTrackerCardComponent {
  private readonly analytics = inject(AnalyticsService);

  readonly summary = input.required<WasteSummary>();
  readonly isPro = input.required<boolean>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);
  readonly level = computed(() => classifyWasteLevel(this.summary().totalCount));
  readonly levelLabelKey = computed(() => `insights.waste.level.${this.level()}`);

  readonly topCategoryLabel = computed<string | null>(() => {
    const top = this.summary().byCategory[0];
    if (!top) return null;
    return formatFriendlyName(top.categoryId, top.categoryId);
  });

  onUnlockClick(): void {
    this.analytics.track(ANALYTICS_EVENTS.PAYWALL_CARD_CLICKED, { surface: 'waste_card' });
  }
}
```

- [ ] **Step 2: Add the pill to the template**

Replace the `@else` branch's count paragraph in
`src/app/shared/components/waste-tracker-card/waste-tracker-card.component.html` (the
zero-waste `@if` branch above it is untouched — it already reads as unambiguously positive):

```html
<h3 class="waste-card__title">{{ 'dashboard.waste.title' | translate }}</h3>

@if (isEmptyZeroWaste()) {
  <p class="waste-card__zero">{{ 'dashboard.waste.zero' | translate }}</p>
} @else {
  <div class="waste-card__count-row">
    <p class="waste-card__count">
      {{ (summary().totalCount === 1 ? 'dashboard.waste.count_one' : 'dashboard.waste.count') | translate: { count: summary().totalCount } }}
    </p>
    <app-insight-status-pill [level]="level()" [labelKey]="levelLabelKey()" />
  </div>
  @if (isPro()) {
    @if (topCategoryLabel(); as topCategory) {
      <p class="waste-card__top">
        {{ 'dashboard.waste.topCategory' | translate: { category: topCategory } }}
      </p>
    }
    <p class="waste-card__trend" [attr.data-trend]="summary().trend">
      {{ ('dashboard.waste.trend.' + summary().trend) | translate }}
    </p>
  } @else {
    <a class="waste-card__locked-hint" routerLink="/upgrade" (click)="onUnlockClick()">
      <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
      {{ 'dashboard.waste.unlockBreakdown' | translate }}
    </a>
  }
}
```

- [ ] **Step 3: Add the row layout and fix the stale comment**

In `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.scss`, the
class comment references `.metric-card__value`, which Task 3 deleted — fix the comment and
add a `&__count-row` rule. Replace:

```scss
  // Matches .metric-card__value / .activity-headline — the other "big
  // number" headlines on this page.
  &__count,
  &__zero {
    font-size: var(--app-theme-font-size-3xl);
    font-weight: var(--app-theme-font-weight-extra-bold);
    line-height: var(--app-theme-line-height-display);
    margin: 0;
  }
```

with:

```scss
  &__count-row {
    display: flex;
    align-items: baseline;
    gap: var(--app-theme-spacing-sm);
  }

  // Matches .activity-headline — the other "big number" headline on this page.
  &__count,
  &__zero {
    font-size: var(--app-theme-font-size-3xl);
    font-weight: var(--app-theme-font-weight-extra-bold);
    line-height: var(--app-theme-line-height-display);
    margin: 0;
  }
```

- [ ] **Step 4: Add the new i18n keys**

Add `waste.level` under the existing `insights` top-level key in **all 6** bundles
(`src/assets/i18n/{es,en,de,fr,it,pt}.json`) — `es` is the source language, translate the
other 5 accordingly. Example for `es.json` — find the `"insights"` object and add:

```json
"waste": {
  "level": {
    "good": "Sin desperdicio",
    "normal": "Normal",
    "bad": "Alto"
  }
}
```

(If `insights.waste` doesn't already exist in a bundle, add it as a new key inside
`insights`; don't nest it under `dashboard.waste`, which is a different namespace already
used by this same card for `title`/`count`/`zero`/etc.)

English (`en.json`): `"good": "No waste"`, `"normal": "Normal"`, `"bad": "High"`.
German (`de.json`): `"good": "Kein Verschwendung"`, `"normal": "Normal"`, `"bad": "Hoch"`.
French (`fr.json`): `"good": "Pas de gaspillage"`, `"normal": "Normal"`, `"bad": "Élevé"`.
Italian (`it.json`): `"good": "Nessuno spreco"`, `"normal": "Normale"`, `"bad": "Alto"`.
Portuguese (`pt.json`): `"good": "Sem desperdício"`, `"normal": "Normal"`, `"bad": "Alto"`.

- [ ] **Step 5: Verify in the browser**

Run: `npx ng build --configuration production 2>&1 | tail -20` — expect no errors.

Then start the dev server (`preview_start` with the project's `web` launch config), open
`/insights`, and confirm: a pantry with 0 expired products shows the unchanged green "¡Sin
desperdicios!" text (no pill); a pantry with 1–2 shows the count with an amber "Normal"
pill; a pantry with 3+ shows the count with a red "Alto" pill. (Use the same
`ng.getComponent(document.querySelector('app-root')).pantryStore.updateItem(...)` console
trick from this session's manual QA to set a past `expirationDate` if you don't want to
click through the add-item UI.)

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/components/waste-tracker-card/ src/assets/i18n/
git commit -m "feat(insights): show a status pill on the waste card"
```

---

### Task 6: Rebuild the Insights page — remove 2 sections, reorder, wire Cobertura + Rotación pills

This is the big template task. Do it in one pass so the page is never left in a half-reordered
state; verify at the end.

**Files:**
- Modify: `src/app/features/insights/insights.component.ts`
- Modify: `src/app/features/insights/insights.component.html`
- Modify: `src/app/features/insights/insights.component.scss`

- [ ] **Step 1: Update the component class**

In `src/app/features/insights/insights.component.ts`:
- Remove the `getQualityBarWidth` method (only used by the deleted "Calidad del inventario"
  section).
- Add `getRotationPillLevel`, mapping the existing `rotationRatio` to a pill level.
- Import and register `InsightStatusPillComponent`.

Full updated file:

```ts
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  IonButtons,
} from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { InsightsTrackingStateService } from '@core/services/insights/insights-tracking-state.service';
import { FoodType } from '@core/models/shared/enums.model';
import { WasteTrackerCardComponent } from '@shared/components/waste-tracker-card/waste-tracker-card.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { InsightStatusPillComponent } from '@shared/components/insight-status-pill/insight-status-pill.component';
import { DurationPipe } from '@shared/pipes/date-display.pipes';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    DurationPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSkeletonText,
    IonButtons,
    WasteTrackerCardComponent,
    ProPaywallCardComponent,
    EmptyStateComponent,
    InsightStatusPillComponent,
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  private readonly insightsTracking = inject(InsightsTrackingStateService);
  private readonly navCtrl = inject(NavController);
  readonly FoodType = FoodType;

  readonly barsVisible = signal(false);
  @ViewChild('barsAnchor') private barsAnchorEl?: ElementRef<HTMLElement>;
  private barObserver?: IntersectionObserver;

  goToPantry(): void {
    void this.navCtrl.navigateRoot('/pantry');
  }

  goToPendientes(): void {
    void this.facade.goToPendientes();
  }

  ionViewDidEnter(): void {
    this.setupBarObserver();
  }

  ionViewWillLeave(): void {
    this.barObserver?.disconnect();
  }

  private setupBarObserver(): void {
    this.barObserver?.disconnect();
    const el = this.barsAnchorEl?.nativeElement;
    if (!el) { this.barsVisible.set(true); return; }
    this.barObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.barsVisible.set(true);
          this.barObserver?.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    this.barObserver.observe(el);
  }

  async ionViewWillEnter(): Promise<void> {
    this.barsVisible.set(false);
    await this.facade.ionViewWillEnter();
    this.insightsTracking.trackWasteCardViewed('insights', {
      isPro: this.facade.isPro(),
      count: this.facade.wasteSummary().totalCount,
    });
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getMaxFoodTypeCount(): number {
    const foodTypes = this.facade.distribution().foodTypes;
    if (!foodTypes.length) return 0;
    return Math.max(...foodTypes.map(f => f.count));
  }

  getRotationLabel(ratio: 'high' | 'medium' | 'low'): string {
    return `insights.activity.rotation${ratio.charAt(0).toUpperCase()}${ratio.slice(1)}`;
  }

  getRotationPillLevel(ratio: 'high' | 'medium' | 'low'): 'good' | 'normal' | 'bad' {
    if (ratio === 'high') return 'good';
    if (ratio === 'medium') return 'normal';
    return 'bad';
  }

  getFoodTypeLabel(foodType: FoodType): string {
    return `pantry.form.foodType.${foodType}`;
  }

  readonly householdSizes = [1, 2, 3, 4] as const;

  setHouseholdSize(n: number): void {
    this.facade.setHouseholdSize(n);
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

- [ ] **Step 2: Simplify the loading skeleton**

The current skeleton (inside `@if (facade.isLoadingEvents())`) mimics the old 6-section
layout, including a `.snapshot-grid`-shaped block that Step 4 below removes the CSS for.
Replace the whole `@if (facade.isLoadingEvents()) { ... }` block in
`src/app/features/insights/insights.component.html` with a version shaped like 4 generic
cards instead:

```html
    @if (facade.isLoadingEvents()) {
      @for (i of [0,1,2,3]; track i) {
        <section class="insights-section">
          <ion-skeleton-text animated style="width: 45%; height: 14px; margin-bottom: 12px; border-radius: 4px;"></ion-skeleton-text>
          <ion-skeleton-text animated style="width: 60%; height: 28px; margin-bottom: 8px; border-radius: 4px;"></ion-skeleton-text>
          <ion-skeleton-text animated style="width: 80%; height: 13px; border-radius: 4px;"></ion-skeleton-text>
        </section>
      }
    } @else if (facade.isEmpty()) {
```

(The `@else if (facade.isEmpty())` line already exists right after the old skeleton block —
this step only replaces what comes *before* it, from `@if (facade.isLoadingEvents())` down to
just before that `@else if`.)

- [ ] **Step 3: Remove "Tu despensa ahora" (old SECTION 2) and reorder Cobertura to 2nd**

Replace the old SECTION 2 + SECTION 3 pair:

```html
      <!-- SECTION 2: Tu despensa ahora -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.snapshot.title' | translate }}</h3>
        <div class="snapshot-grid">
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().active }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.active' | translate }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().expired }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.expired' | translate }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().review }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.review' | translate }}</span>
          </div>
          <div class="metric-card">
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
            <div class="coverage-card__info">
              <span class="coverage-card__value">
                {{ 'dashboard.foodCoverage.value' | translate:{ duration: (facade.foodCoverage()!.days | appDuration) } }}
              </span>
              <span class="coverage-card__hint">{{ 'dashboard.foodCoverage.hint' | translate }}</span>
            </div>
          </div>
          <div class="household-selector">
            <span class="household-selector__label">{{ 'insights.coverage.household' | translate }}</span>
            <ion-segment
              class="household-segment"
              [value]="facade.householdSize().toString()"
              (ionChange)="setHouseholdSize(+$event.detail.value!)">
              @for (n of householdSizes; track n) {
                <ion-segment-button [value]="n.toString()">
                  <ion-label>{{ n === 4 ? '4+' : n }}</ion-label>
                </ion-segment-button>
              }
            </ion-segment>
          </div>
        </section>
      }
```

with just the Cobertura section (no more snapshot, promoted to 2nd position right after
Desperdicio), now carrying the pill and the new interpretive sentence in place of the old
generic hint:

```html
      <!-- SECTION 2: Cobertura -->
      @if (facade.foodCoverage(); as coverage) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.coverage.title' | translate }}</h3>
          <div class="coverage-card">
            <ion-icon name="calendar-outline"></ion-icon>
            <div class="coverage-card__info">
              <div class="coverage-card__headline">
                <span class="coverage-card__value">
                  {{ 'dashboard.foodCoverage.value' | translate:{ duration: (coverage.days | appDuration) } }}
                </span>
                @if (facade.coverageLevel(); as level) {
                  <app-insight-status-pill [level]="level" [labelKey]="'insights.coverage.level.' + level" />
                }
              </div>
              <span class="coverage-card__hint">
                {{ 'insights.coverage.sentence' | translate:{ duration: (coverage.days | appDuration) } }}
              </span>
            </div>
          </div>
          <div class="household-selector">
            <span class="household-selector__label">{{ 'insights.coverage.household' | translate }}</span>
            <ion-segment
              class="household-segment"
              [value]="facade.householdSize().toString()"
              (ionChange)="setHouseholdSize(+$event.detail.value!)">
              @for (n of householdSizes; track n) {
                <ion-segment-button [value]="n.toString()">
                  <ion-label>{{ n === 4 ? '4+' : n }}</ion-label>
                </ion-segment-button>
              }
            </ion-segment>
          </div>
        </section>
      }
```

- [ ] **Step 4: Rebuild Rotación (old SECTION 4) with the pill, moved to 3rd**

This section is already in the right relative position (right after Cobertura) — just
rework its contents. Replace:

```html
      <!-- SECTION 4: Últimos 30 días — rotation: how much of what you add you actually consume -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.activity.title' | translate }}</h3>
        @let rotationRatio = facade.activityMetrics().rotationRatio;
        @if (rotationRatio === null) {
          <p class="activity-empty">{{ 'insights.activity.noActivity' | translate }}</p>
        } @else {
          @if (facade.activityMetrics().rotationPercent !== null) {
            <p class="activity-headline">{{ formatPercent(facade.activityMetrics().rotationPercent!) }}</p>
          }
          <p class="activity-detail">
            @if (facade.activityMetrics().added > 0) {
              {{ 'insights.activity.detail' | translate: { consumed: facade.activityMetrics().consumed, added: facade.activityMetrics().added } }}
            } @else {
              {{ 'insights.activity.detailNoAdds' | translate: { consumed: facade.activityMetrics().consumed } }}
            }
          </p>
          <div class="rotation-badge">
            <ion-icon name="refresh-outline"></ion-icon>
            <span>{{ getRotationLabel(rotationRatio) | translate }}</span>
          </div>
        }
      </section>
```

with:

```html
      <!-- SECTION 3: Rotación — how much of what you add you actually consume -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.activity.title' | translate }}</h3>
        @let rotationRatio = facade.activityMetrics().rotationRatio;
        @if (rotationRatio === null) {
          <p class="activity-empty">{{ 'insights.activity.noActivity' | translate }}</p>
        } @else {
          <div class="activity-headline-row">
            @if (facade.activityMetrics().rotationPercent !== null) {
              <p class="activity-headline">{{ formatPercent(facade.activityMetrics().rotationPercent!) }}</p>
            }
            <app-insight-status-pill [level]="getRotationPillLevel(rotationRatio)" [labelKey]="getRotationLabel(rotationRatio)" />
          </div>
          <p class="activity-detail">
            {{ 'insights.activity.windowLabel' | translate }} —
            @if (facade.activityMetrics().added > 0) {
              {{ 'insights.activity.detail' | translate: { consumed: facade.activityMetrics().consumed, added: facade.activityMetrics().added } }}
            } @else {
              {{ 'insights.activity.detailNoAdds' | translate: { consumed: facade.activityMetrics().consumed } }}
            }
          </p>
        }
      </section>
```

- [ ] **Step 5: Rename "Por tipo de alimento" (old SECTION 5) to "Clasificación"**

This section's contents don't change — only its title key's translated text (Step 7 below).
No HTML edit needed here beyond confirming it's the last of the 4 cards, which it already is
(it sits right after the `#barsAnchor` sentinel, unchanged). Leave
`<!-- SECTION 5: Por tipo de alimento -->` as-is or update the comment to
`<!-- SECTION 4: Clasificación -->` for clarity — do the latter, it's a one-line comment edit.

- [ ] **Step 6: Delete "Calidad del inventario" (old SECTION 6)**

Delete the entire block, from `<!-- SECTION 6: Calidad del inventario -->` through its
closing `}` — this is everything between the Clasificación section's closing `</section>`
and the `<!-- SECTION 7: PRO analysis / teaser -->` comment:

```html
      <!-- SECTION 6: Calidad del inventario -->
      <!-- Only worth showing while something is actually missing. Since the add
           flows infer food type and expiry, a complete inventory would otherwise
           render a permanent 100% bar and two empty ones with no action behind
           them. `pendientes` is the same isIncomplete() predicate that powers the
           Pendientes chip, so the card and its CTA appear and vanish together. -->
      @if (facade.inventorySnapshot().total >= 1 && facade.inventorySnapshot().pendientes > 0) {
        <section class="insights-section">
          ... (everything through its closing @if's `}` and `</section>`)
        </section>
      }
```

Delete the whole thing — there is nothing to keep. Renumber the trailing comment
`<!-- SECTION 7: PRO analysis / teaser -->` to `<!-- SECTION 5: PRO analysis / teaser -->`
for consistency (cosmetic, but do it while you're there).

- [ ] **Step 7: Update i18n — new keys and retitled sections, all 6 bundles**

In `src/assets/i18n/es.json` (repeat for `en`, `de`, `fr`, `it`, `pt` with translated text):

Under `insights.coverage`, change `"title"` from `"Cobertura estimada"` to `"Cobertura"`,
and add a `level` object and a `sentence` key:

```json
"coverage": {
  "title": "Cobertura",
  "household": "Personas en casa",
  "sentence": "Con lo que tienes, aguantas {{duration}} sin comprar",
  "level": {
    "good": "Buena",
    "normal": "Ajustado",
    "bad": "Bajo"
  }
}
```

Under `insights.activity`, change `"title"` from `"Últimos 30 días"` to `"Rotación"`, and
add a `windowLabel` key carrying the old title text:

```json
"activity": {
  "title": "Rotación",
  "windowLabel": "Últimos 30 días",
  "detail": "Añadiste {{added}} veces y usaste {{consumed}} veces este mes",
  "detailNoAdds": "Usaste {{consumed}} veces sin añadir nada este mes",
  "noActivity": "Sin actividad registrada",
  "rotationHigh": "Rotación alta",
  "rotationMedium": "Rotación media",
  "rotationLow": "Rotación baja"
}
```

Under `insights.distribution`, change `"title"` from `"Por tipo de alimento"` to
`"Clasificación"` — everything else in that object (`mostWasted`, `leastRotating`) stays.

Delete the now-orphaned `insights.snapshot` and `insights.quality` objects entirely (both
sections that used them are gone, and neither key is used anywhere else — confirm with the
grep in Step 8 before deleting).

English (`en.json`) reference translations: `coverage.title` "Coverage", `coverage.sentence`
"With what you have, you'll last {{duration}} without shopping", `coverage.level.good` "Good",
`coverage.level.normal` "Tight", `coverage.level.bad` "Low", `activity.title` "Rotation",
`activity.windowLabel` "Last 30 days", `distribution.title` "Breakdown".

German (`de.json`): `coverage.title` "Reichweite", `coverage.sentence` "Mit dem, was du hast,
kommst du {{duration}} ohne Einkauf aus", `coverage.level.good` "Gut", `coverage.level.normal`
"Knapp", `coverage.level.bad` "Niedrig", `activity.title` "Rotation", `activity.windowLabel`
"Letzte 30 Tage", `distribution.title` "Einordnung".

French (`fr.json`): `coverage.title` "Couverture", `coverage.sentence` "Avec ce que tu as, tu
tiens {{duration}} sans faire de courses", `coverage.level.good` "Bonne", `coverage.level.normal`
"Juste", `coverage.level.bad` "Faible", `activity.title` "Rotation", `activity.windowLabel`
"30 derniers jours", `distribution.title` "Classification".

Italian (`it.json`): `coverage.title` "Copertura", `coverage.sentence` "Con quello che hai,
duri {{duration}} senza fare la spesa", `coverage.level.good` "Buona", `coverage.level.normal`
"Limitata", `coverage.level.bad` "Bassa", `activity.title` "Rotazione", `activity.windowLabel`
"Ultimi 30 giorni", `distribution.title` "Classificazione".

Portuguese (`pt.json`): `coverage.title` "Cobertura", `coverage.sentence` "Com o que tens,
aguentas {{duration}} sem comprar", `coverage.level.good` "Boa", `coverage.level.normal`
"Apertada", `coverage.level.bad` "Baixa", `activity.title` "Rotação", `activity.windowLabel`
"Últimos 30 dias", `distribution.title` "Classificação".

- [ ] **Step 8: Confirm the deleted keys have no other reference**

Run:

```bash
grep -rn "insights\.snapshot\.\|insights\.quality\.\|dashboard\.pantryScore\." src/app --include="*.html" --include="*.ts"
```

Expected: no output. If anything shows up, don't delete those specific keys in Step 7 —
leave them and note it when reporting this task done.

- [ ] **Step 9: Update `insights.component.scss`**

Delete the "Section A — snapshot grid" block (`.snapshot-grid`, `.metric-card`,
`.no-expiry-hint` — the last one was already dead before this change, confirmed by grep, it
just happened to live in the same block), the "Rotation badge" block (`.rotation-badge` —
fully replaced by the shared pill), the `.distribution-badge--action` modifier only (its base
`.distribution-badge`/`.distribution-badges` stay, still used by Clasificación), and the
whole "Quality score" + "Quality bars" blocks (`.quality-score`, `.quality-bars`,
`.quality-bar-row`).

Add two small new rules for the headline+pill rows introduced in Steps 3–4, next to the
rules they extend:

In the "Coverage card" section, add `&__headline` inside `.coverage-card`:

```scss
  &__headline {
    display: flex;
    align-items: baseline;
    gap: var(--app-theme-spacing-sm);
  }

  &__value {
    font-size: var(--app-theme-font-size-title);
    font-weight: var(--app-theme-font-weight-bold);
  }
```

(this replaces the old `&__value { ...; flex: 1; }` rule — `flex: 1` doesn't apply once
`__value` sits inside the new `&__headline` row instead of directly inside `&__info`; the
new `&__headline` wraps just the value + pill, `&__hint` stays a sibling below it inside
`&__info` as before).

In the "Section B — activity" area, add a new `.activity-headline-row` rule right before
`.activity-headline`:

```scss
.activity-headline-row {
  display: flex;
  align-items: baseline;
  gap: var(--app-theme-spacing-sm);
}

.activity-headline {
  font-size: var(--app-theme-font-size-3xl);
  font-weight: var(--app-theme-font-weight-extra-bold);
  line-height: var(--app-theme-line-height-display);
  margin: 0;
}
```

- [ ] **Step 10: Run the full verification pass**

```bash
npx ng lint
node scripts/check-icons.mjs
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: lint 0 errors, check-icons all registered, all tests pass, build succeeds.

- [ ] **Step 11: Verify in the browser**

Start the dev server, open `/insights` with a pantry that has: at least one already-expired
item (for a non-zero waste pill), enough active items for coverage/rotation/distribution to
render (≥3 items with quantity for coverage, per `computeFoodCoverage`'s own floor). Confirm:
- 4 cards in order: Desperdicio, Cobertura, Rotación, Clasificación.
- Cobertura shows a pill (verde/ámbar/rojo per your test data) and the new sentence text
  (not the old "Estimación basada en..." hint).
- Rotación shows a pill instead of the old grey badge.
- Clasificación has no pill, same bars and "mayor incidencia"/"baja rotación" tags as before.
- Neither "Tu despensa ahora" nor "Calidad del inventario" render anywhere on the page.
- The household-size 1/2/3/4+ selector under Cobertura still works and persists across a
  page reload.

- [ ] **Step 12: Commit**

```bash
git add src/app/features/insights/ src/assets/i18n/
git commit -m "feat(insights): reorganize to 4 cards with status pills

Drops \"Tu despensa ahora\" and \"Calidad del inventario\" (no
interpretation, duplicated elsewhere — Dashboard's own \"Faltan
datos\" card already covers completing pendientes). Reorders to
Desperdicio → Cobertura → Rotación → Clasificación, each of the first
three carrying a verde/ámbar/rojo status pill. Clasificación keeps its
existing mostWasted/leastRotating tags, now with equal visual weight
to the other three instead of a footnote."
```

---

## Self-Review Notes (already applied above, kept for the reviewer)

- **Spec coverage:** card removal (Task 6 Steps 3+6), reorder (Task 6 Steps 3–5), pill style
  chosen in brainstorming (Tasks 4–6), thresholds from the spec (Tasks 1–2), PRO split
  unchanged (no task touches `isPro()` gating — confirmed untouched), household selector
  unchanged (Task 6 Step 3 keeps it verbatim), no 5th card (not built).
- **Dead code:** `computeInventorySnapshot`/`computePantryScore` and their types, tests,
  facade computeds, and the i18n keys they alone used are all deleted (Task 3, Task 6
  Step 7–8), not just hidden behind the removed template sections.
- **Type consistency:** `InsightPillLevel` (component) and the domain `WasteLevel`/
  `CoverageLevel` types are structurally identical (`'good' | 'normal' | 'bad'`) but kept as
  separate type aliases — the component doesn't import a domain type, it just requires the
  same 3 string literals, which is what every call site (Tasks 6–7) actually passes.
