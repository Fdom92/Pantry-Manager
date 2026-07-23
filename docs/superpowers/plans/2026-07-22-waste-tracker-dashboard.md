# Waste Tracker Dashboard Teaser + Insight-Pill Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a free, always-visible "waste this month" count on the Dashboard that links to the existing PRO breakdown in Insights, and reduce Dashboard clutter by giving the free-tier "Próximas compras" teaser the same compact, ambient treatment.

**Architecture:** Reuse the existing `WasteSummary`/`computeWasteSummary` domain logic and `InsightsStateService.wasteSummary` signal unchanged — zero new data fetching or domain code. Add a `variant: 'card' | 'pill'` input to the already-shared `ProPaywallCardComponent` so its compact form is available everywhere without duplicating paywall/dismiss/analytics logic. Add one new presentational component, `WasteTeaserCardComponent`, styled to match the new pill visually but kept separate because it shows real free data (no lock, links to `/insights` not `/upgrade`).

**Tech Stack:** Angular 20 standalone components, Signals, Ionic 8 (`ion-card`), `@ngx-translate`.

**Spec:** `docs/superpowers/specs/2026-07-22-waste-tracker-dashboard-design.md`

**Testing note:** No new `.spec.ts` files. Presentational dashboard/insight cards in this codebase (`streak-card`, `reposition-card`, `waste-tracker-card`) have no component tests — logic lives entirely in already-tested domain functions (`waste.domain.spec.ts`, unchanged here). Each task below is verified with a TypeScript/template compile check (`ng build`); Task 4 is a full manual on-device pass.

---

### Task 1: `ProPaywallCardComponent` — add `pill` variant

**Files:**
- Modify: `src/app/shared/components/pro-paywall-card/pro-paywall-card.component.ts`
- Modify: `src/app/shared/components/pro-paywall-card/pro-paywall-card.component.html`
- Modify: `src/app/shared/components/pro-paywall-card/pro-paywall-card.component.scss`

- [ ] **Step 1: Add the `variant` input**

In `pro-paywall-card.component.ts`, the input block currently reads (lines 30-37):

```ts
  readonly surface = input.required<ProCtaSurface>();
  readonly isDismissed = computed(() => this.ctaUi.isDismissed(this.surface()));
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
  /** Hide the embedded trial button when the surface hosts another primary CTA. */
  readonly hideCta = input(false, { transform: booleanAttribute });
  /** Show the "Ahora no" dismiss link under the trial button. */
  readonly dismissible = input(false, { transform: booleanAttribute });
```

Replace with:

```ts
  readonly surface = input.required<ProCtaSurface>();
  readonly isDismissed = computed(() => this.ctaUi.isDismissed(this.surface()));
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
  /** Hide the embedded trial button when the surface hosts another primary CTA. */
  readonly hideCta = input(false, { transform: booleanAttribute });
  /** Show the "Ahora no" dismiss link under the trial button. */
  readonly dismissible = input(false, { transform: booleanAttribute });
  /** 'pill' renders a single-row compact form (icon + title + chevron) for dense surfaces like Dashboard. Description and CTA are not shown in 'pill'. */
  readonly variant = input<'card' | 'pill'>('card');
```

- [ ] **Step 2: Branch the template on `variant()`**

Replace the full contents of `pro-paywall-card.component.html` with:

```html
<ion-card class="pro-paywall-card" [class.pro-paywall-card--pill]="variant() === 'pill'" button (click)="onCardClick()">
  <ion-card-content class="pro-paywall-card__content">
    @if (variant() === 'pill') {
      <span class="pro-paywall-card__lock" aria-hidden="true">
        <ion-icon name="lock-closed-outline"></ion-icon>
      </span>
      <h3 class="pro-paywall-card__pill-title">{{ titleKey() | translate }}</h3>
      <ion-icon name="chevron-forward-outline" class="pro-paywall-card__chevron" aria-hidden="true"></ion-icon>
    } @else {
      <span class="pro-paywall-card__lock" aria-hidden="true">
        <ion-icon name="lock-closed-outline"></ion-icon>
      </span>
      <ion-icon name="sparkles-outline" class="pro-paywall-card__icon" aria-hidden="true"></ion-icon>
      <h3 class="pro-paywall-card__title">{{ titleKey() | translate }}</h3>
      <p class="pro-paywall-card__description">{{ descriptionKey() | translate }}</p>
      <ng-content />
      @if (!hideCta()) {
        <div class="pro-paywall-card__cta" (click)="$event.stopPropagation()">
          <app-pro-trial-cta [surface]="surface()" [dismissible]="dismissible()" compact />
        </div>
      }
    }
  </ion-card-content>
</ion-card>
```

- [ ] **Step 3: Add pill styles**

Append to `pro-paywall-card.component.scss`:

```scss
.pro-paywall-card--pill {
  .pro-paywall-card__content {
    flex-direction: row;
    align-items: center;
    text-align: left;
    gap: var(--app-theme-spacing-sm);
    padding: var(--app-theme-spacing-sm) var(--app-theme-spacing-md);
  }

  .pro-paywall-card__lock {
    position: static;
    flex-shrink: 0;
  }
}

.pro-paywall-card__pill-title {
  flex: 1;
  margin: 0;
  font-size: var(--app-theme-font-size-small);
  font-weight: var(--app-theme-font-weight-bold);
  color: var(--app-theme-text-color);
}

.pro-paywall-card__chevron {
  font-size: var(--app-theme-icon-size-sm);
  color: var(--ion-color-medium);
  flex-shrink: 0;
}
```

- [ ] **Step 4: Compile check**

Run: `npx ng build`
Expected: build succeeds, no template/type errors. (Existing usages in Insights/Settings/Dashboard omit `variant`, so they keep defaulting to `'card'` — visually unchanged.)

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/pro-paywall-card/
git commit -m "feat(dashboard): add compact pill variant to ProPaywallCardComponent"
```

---

### Task 2: `WasteTeaserCardComponent` (new)

**Files:**
- Create: `src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.ts`
- Create: `src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.html`
- Create: `src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.scss`

- [ ] **Step 1: Create the component class**

`src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';

/**
 * Free, ambient summary of this month's waste (total count only). Tapping
 * links to Insights, where the full breakdown (category/top product/trend)
 * stays PRO-gated. Not a paywall — the count shown here is real data, not a
 * locked teaser — so it does not reuse `ProPaywallCardComponent`.
 */
@Component({
  selector: 'app-waste-teaser-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonIcon, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-teaser-card.component.html',
  styleUrl: './waste-teaser-card.component.scss',
})
export class WasteTeaserCardComponent {
  readonly summary = input.required<WasteSummary>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);
}
```

- [ ] **Step 2: Create the template**

`src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.html`:

```html
<ion-card class="waste-teaser-card" button routerLink="/insights">
  <ion-card-content class="waste-teaser-card__content">
    <ion-icon name="trash-outline" class="waste-teaser-card__icon" aria-hidden="true"></ion-icon>
    <span class="waste-teaser-card__text">
      @if (isEmptyZeroWaste()) {
        {{ 'dashboard.waste.zero' | translate }}
      } @else {
        {{ 'dashboard.waste.count' | translate: { count: summary().totalCount } }}
      }
    </span>
    <ion-icon name="chevron-forward-outline" class="waste-teaser-card__chevron" aria-hidden="true"></ion-icon>
  </ion-card-content>
</ion-card>
```

- [ ] **Step 3: Create the styles**

`src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.scss`:

```scss
.waste-teaser-card {
  margin: 0;
  box-shadow: none;
  cursor: pointer;
}

.waste-teaser-card__content {
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-sm);
  padding: var(--app-theme-spacing-sm) var(--app-theme-spacing-md);
}

.waste-teaser-card__icon {
  font-size: var(--app-theme-icon-size-sm);
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

.waste-teaser-card__text {
  flex: 1;
  font-size: var(--app-theme-font-size-small);
  color: var(--app-theme-text-color);
}

.waste-teaser-card__chevron {
  font-size: var(--app-theme-icon-size-sm);
  color: var(--ion-color-medium);
  flex-shrink: 0;
}
```

- [ ] **Step 4: Compile check**

Run: `npx ng build`
Expected: build succeeds. The component isn't referenced anywhere yet, so Angular's build will not error on that alone — this step just confirms the new files themselves are valid TS/template/SCSS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/components/waste-teaser-card/
git commit -m "feat(dashboard): add WasteTeaserCardComponent"
```

---

### Task 3: Wire both into `DashboardComponent`

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`

- [ ] **Step 1: Import the new component and expose `wasteSummary`**

In `dashboard.component.ts`, the import block currently has (lines 13-15):

```ts
import { RepositionCardComponent } from '@shared/components/reposition-card/reposition-card.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { StreakCardComponent } from './components/streak-card/streak-card.component';
```

Replace with:

```ts
import { RepositionCardComponent } from '@shared/components/reposition-card/reposition-card.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { StreakCardComponent } from './components/streak-card/streak-card.component';
import { WasteTeaserCardComponent } from './components/waste-teaser-card/waste-teaser-card.component';
```

The `imports` array currently has (lines 44-49):

```ts
    BatchEditModalComponent,
    EmptyStateComponent,
    ReconsentSheetComponent,
    RepositionCardComponent,
    ProPaywallCardComponent,
    StreakCardComponent,
  ],
```

Replace with:

```ts
    BatchEditModalComponent,
    EmptyStateComponent,
    ReconsentSheetComponent,
    RepositionCardComponent,
    ProPaywallCardComponent,
    StreakCardComponent,
    WasteTeaserCardComponent,
  ],
```

The signal exposure block currently has (line 74):

```ts
  readonly repositionPredictions = this.insights.repositionPredictions;
```

Replace with:

```ts
  readonly repositionPredictions = this.insights.repositionPredictions;
  readonly wasteSummary = this.insights.wasteSummary;
```

- [ ] **Step 2: Track the dashboard waste-card view**

`ionViewWillEnter` currently reads (lines 84-93):

```ts
  async ionViewWillEnter(): Promise<void> {
    this.isViewActive = true;
    await this.facade.ionViewWillEnter();
    await this.insights.loadEvents();
    this.insightsTracking.trackRepoPredictionViewed('dashboard', {
      isPro: this.isInsightsPro(),
      count: this.repositionPredictions().length,
    });
    this.maybePresentReconsentSheet();
  }
```

Replace with:

```ts
  async ionViewWillEnter(): Promise<void> {
    this.isViewActive = true;
    await this.facade.ionViewWillEnter();
    await this.insights.loadEvents();
    this.insightsTracking.trackRepoPredictionViewed('dashboard', {
      isPro: this.isInsightsPro(),
      count: this.repositionPredictions().length,
    });
    this.insightsTracking.trackWasteCardViewed('dashboard', {
      isPro: this.isInsightsPro(),
      count: this.wasteSummary().totalCount,
    });
    this.maybePresentReconsentSheet();
  }
```

- [ ] **Step 3: Compact the free-tier reposition block and add the waste row**

In `dashboard.component.html`, the "Próximas compras" block currently reads (lines 170-197):

```html
      <!-- Próximas compras (reposition) — PRO with real predictions; free users get the locked teaser -->
      @if (facade.totalItems() > 0) {
        @if (isInsightsPro()) {
          @if (repositionPredictions().length > 0) {
            <section class="dashboard-section">
              <header class="dashboard-section-header">
                <h3 class="dashboard-section-title">{{ 'dashboard.sections.reposition.title' | translate }}</h3>
              </header>
              <app-reposition-card
                [predictions]="repositionPredictions()"
                (addToList)="onAddRepoPredictionToList($event)"
              />
            </section>
          }
        } @else {
          <section class="dashboard-section">
            <header class="dashboard-section-header">
              <h3 class="dashboard-section-title">{{ 'dashboard.sections.reposition.title' | translate }}</h3>
            </header>
            <app-pro-paywall-card
              surface="reposition_card"
              titleKey="dashboard.reposition.title"
              descriptionKey="dashboard.reposition.teaser"
              hideCta
            />
          </section>
        }
      }
```

Replace with:

```html
      <!-- Próximas compras (reposition) — PRO with real predictions; free users get a compact locked pill -->
      @if (facade.totalItems() > 0) {
        @if (isInsightsPro()) {
          @if (repositionPredictions().length > 0) {
            <section class="dashboard-section">
              <header class="dashboard-section-header">
                <h3 class="dashboard-section-title">{{ 'dashboard.sections.reposition.title' | translate }}</h3>
              </header>
              <app-reposition-card
                [predictions]="repositionPredictions()"
                (addToList)="onAddRepoPredictionToList($event)"
              />
            </section>
          }
        } @else {
          <app-pro-paywall-card
            surface="reposition_card"
            titleKey="dashboard.reposition.title"
            descriptionKey="dashboard.reposition.teaser"
            variant="pill"
            hideCta
          />
        }
      }

      <!-- Desperdicio este mes — free, ambient, links to the full PRO breakdown in Insights -->
      @if (facade.totalItems() > 0) {
        <app-waste-teaser-card [summary]="wasteSummary()" />
      }
```

- [ ] **Step 4: Compile check**

Run: `npx ng build`
Expected: build succeeds, no unused-import or template binding errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/dashboard.component.ts src/app/features/dashboard/dashboard.component.html
git commit -m "feat(dashboard): surface waste teaser and compact the reposition free pill"
```

---

### Task 4: Manual verification on device

**Files:** none (verification only)

- [ ] **Step 1: Production build + sync**

Run: `npm run prepare:prod-build`
Expected: completes without errors (mirrors the command used for every real release build in this repo).

- [ ] **Step 2: Open in Android Studio and run on device/emulator**

Run: `npx cap open android`, then Run ▶️ from Android Studio (uses its own bundled JBR, no `JAVA_HOME` juggling needed).

- [ ] **Step 3: Verify free-tier Dashboard**

With `UpgradeRevenuecatService.setDevProState(false)` (or default dev state if already free): open Dashboard with a non-empty pantry. Confirm:
- "Próximas compras" renders as a single compact row (icon + "Próximamente sin stock" + chevron), not a full section with header/description.
- A new "Desperdicio este mes" row renders below it, same compact height, showing either the zero-waste copy or a count, and tapping it navigates to the Insights tab.

- [ ] **Step 4: Verify PRO-tier Dashboard**

Call `UpgradeRevenuecatService.setDevProState(true)` (Settings → Advanced, or via dev console per `.claude/DEV.md`). Confirm:
- "Próximas compras" is unchanged — still a full section with header and the real predictions list (when any exist).
- The waste row still renders as the compact pill and still links to Insights.

- [ ] **Step 5: Verify Insights and Settings are unaffected**

Open the Insights tab: confirm the waste card (PRO) or paywall card (free) still render as the full `'card'` variant, unchanged from before this branch. Open Settings and confirm any `app-pro-paywall-card` usage there is also unchanged.

No commit for this task — it's verification only. If any step fails, fix the relevant file from Task 1-3 and re-run from Step 1.

---

## Self-review

- **Spec coverage:** §1 (ProPaywallCardComponent variant) → Task 1. §2 (WasteTeaserCardComponent) → Task 2. §3 (DashboardComponent wiring, both the reposition reflow and the new waste row) → Task 3. "Sin cambios" section (domain, Insights, Settings, i18n, analytics constant) → verified in Task 4 Step 5, nothing else touches those files. Testing section → covered by the note at the top of this plan.
- **Placeholder scan:** none found — every step has literal file contents or exact commands.
- **Type consistency:** `WasteSummary` imported from `@core/domain/insights/waste.domain` in both `InsightsStateService` (existing) and `WasteTeaserCardComponent` (Task 2) — same type, same import path. `variant()` values `'card' | 'pill'` used identically in the input declaration (Task 1 Step 1) and the template checks (Task 1 Step 2). `trackWasteCardViewed('dashboard', { isPro, count })` matches the existing method signature in `InsightsTrackingStateService` (`surface: 'dashboard' | 'insights'`, `ctx: { isPro: boolean; count: number }`) — no changes needed to that service.

---

## Task 5 (post-verification fix): Insights free tier must show the same real count

**Found during Task 4 manual verification.** The plan's own spec said the count is free everywhere and only the category/product/trend breakdown stays PRO — but Task 3 left the Insights tab's waste section fully gated (`facade.isPro()` ? full `WasteTrackerCardComponent` : full `app-pro-paywall-card`, count included in the locked side). Result: Dashboard shows "Has tirado 5 productos" for free, tapping it goes to Insights, which then hides that same number behind a lock. Confirmed by the user in a device screenshot. Root cause: the PRO gate was applied at the whole-card level instead of at the breakdown-field level.

**Files:**
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.ts`
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.html`
- Modify: `src/app/shared/components/waste-tracker-card/waste-tracker-card.component.scss`
- Modify: `src/app/features/insights/insights.component.html`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Make `WasteTrackerCardComponent` tier-aware internally**

Replace `waste-tracker-card.component.ts` in full:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';
import { formatFriendlyName } from '@core/utils/normalization.util';

/**
 * Waste summary card. The total count (or zero-waste state) is shown to
 * everyone — it's free data. The category/top-product/trend breakdown is
 * PRO-only: free users see a single locked hint linking to /upgrade instead.
 */
@Component({
  selector: 'app-waste-tracker-card',
  standalone: true,
  imports: [
    TranslateModule,
    RouterLink,
    IonIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-tracker-card.component.html',
  styleUrl: './waste-tracker-card.component.scss',
})
export class WasteTrackerCardComponent {
  readonly summary = input.required<WasteSummary>();
  readonly isPro = input.required<boolean>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);

  readonly topCategoryLabel = computed<string | null>(() => {
    const top = this.summary().byCategory[0];
    if (!top) return null;
    return formatFriendlyName(top.categoryId, top.categoryId);
  });
}
```

(Only change from before: new `isPro = input.required<boolean>()`, and the class docstring.)

- [ ] **Step 2: Gate only the breakdown rows in the template**

Replace `waste-tracker-card.component.html` in full:

```html
<h3 class="waste-card__title">{{ 'dashboard.waste.title' | translate }}</h3>

@if (isEmptyZeroWaste()) {
  <p class="waste-card__zero">{{ 'dashboard.waste.zero' | translate }}</p>
} @else {
  <p class="waste-card__count">
    {{ 'dashboard.waste.count' | translate: { count: summary().totalCount } }}
  </p>
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
    <a class="waste-card__locked-hint" routerLink="/upgrade">
      <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
      {{ 'dashboard.waste.unlockBreakdown' | translate }}
    </a>
  }
}
```

- [ ] **Step 3: Style the locked-hint row**

Append inside the existing `.waste-card { ... }` block in `waste-tracker-card.component.scss` (the file nests `&__x` selectors, unlike `pro-paywall-card`'s flat style — follow this file's own convention):

```scss
  &__locked-hint {
    display: flex;
    align-items: center;
    gap: var(--app-theme-spacing-2xs);
    margin-top: var(--app-theme-spacing-sm);
    font-size: var(--app-theme-font-size-small);
    color: var(--ion-color-tertiary);
    text-decoration: none;

    ion-icon {
      font-size: var(--app-theme-icon-size-sm);
    }
  }
```

- [ ] **Step 4: Always render the card in Insights, pass `isPro`**

In `insights.component.html`, the waste section currently reads:

```html
      <!-- SECTION 1: Waste tracker — full data for PRO, locked teaser for free (bottom paywall hosts the trial CTA) -->
      @if (facade.isPro()) {
        <section class="insights-section">
          <app-waste-tracker-card [summary]="facade.wasteSummary()" />
        </section>
      } @else {
        <app-pro-paywall-card
          surface="waste_card"
          titleKey="dashboard.waste.title"
          descriptionKey="dashboard.waste.teaser"
          hideCta
        />
      }
```

Replace with:

```html
      <!-- SECTION 1: Waste tracker — count is free for everyone, breakdown is PRO-gated inside the card -->
      <section class="insights-section">
        <app-waste-tracker-card [summary]="facade.wasteSummary()" [isPro]="facade.isPro()" />
      </section>
```

`app-pro-paywall-card` stays imported in `insights.component.ts` — it's still used elsewhere in this same file (its other usage around line 310 is untouched).

- [ ] **Step 5: Add the new i18n key, remove the now-dead one**

In each of `src/assets/i18n/{es,en,de,fr,it,pt}.json`, inside the existing `"waste": { ... }` object: remove the `"teaser"` key (no longer referenced anywhere after Step 4) and add `"unlockBreakdown"`:

- es: `"unlockBreakdown": "Desbloquea el desglose por categoría y tendencia"`
- en: `"unlockBreakdown": "Unlock the category and trend breakdown"`
- de: `"unlockBreakdown": "Schalte die Aufschlüsselung nach Kategorie und Trend frei"`
- fr: `"unlockBreakdown": "Débloque la répartition par catégorie et tendance"`
- it: `"unlockBreakdown": "Sblocca la suddivisione per categoria e tendenza"`
- pt: `"unlockBreakdown": "Desbloqueia o detalhe por categoria e tendência"`

Before editing, run `grep -n "dashboard.waste.teaser" -r src/app` to confirm it's truly unreferenced after Step 4 (it should only have matched `insights.component.html`, which Step 4 just changed).

- [ ] **Step 6: Compile check**

Run: `npx ng build`
Expected: succeeds, no missing-translation-key errors (this app doesn't fail build on missing i18n keys, but double check no other code references `dashboard.waste.teaser`).

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/components/waste-tracker-card/ src/app/features/insights/insights.component.html src/assets/i18n/
git commit -m "fix(insights): make waste count free everywhere, gate only the breakdown"
```

**Self-review addendum:** This directly closes the gap the original Task 3 self-review missed — the plan's "Sin cambios ... gate PRO en Insights — intactos" line (top of this doc, §"Sin cambios") was wrong; the gate needed to move from card-level to field-level for the free/PRO story to be consistent across Dashboard and Insights. `'waste_card'` stays as an unused-but-harmless entry in `ProCtaSurface` (`src/app/core/services/upgrade/pro-cta-ui-state.service.ts:7`) — not removed, since it's a type-only union member with no behavioral cost and removing it risks unrelated churn.

---

## Task 6 (follow-up): de-duplicate "Últimos 30 días" against the waste card

**Found by the user while reviewing the Task 5 fix.** Insights Section 4 ("Últimos 30 días", always free, pre-dates this branch) shows `Consumidos` / `Caducados` / `Desperdicio %`. `Caducados` and `Desperdicio %` are derived from the exact same EXPIRE events as the waste card above it (`computeActivityMetrics`'s `expired` field counts the same events `computeWasteSummary`'s `totalCount` does, both over a 30-day window — see `src/app/core/domain/insights/insights-free.domain.ts:109-118`). Before this branch this redundancy already existed for PRO users; Task 5 made it visible to free users too, since the waste card's count is no longer locked. Not a bug introduced by this branch, but worth trimming while this exact file is already open.

**Files:**
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Step 1: Replace Section 4 with a de-duplicated version**

Current section (post-Task-5, unchanged since it wasn't touched by Task 5):

```html
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
        <div class="rotation-badge">
          <ion-icon name="refresh-outline"></ion-icon>
          <span>{{ getRotationLabel(facade.activityMetrics().rotationRatio) | translate }}</span>
        </div>
      </section>
```

Replace with:

```html
      <!-- SECTION 4: Últimos 30 días — consumption behavior only; waste has its own card above (Section 1), no need to repeat it here -->
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
        </div>
        <div class="rotation-badge">
          <ion-icon name="refresh-outline"></ion-icon>
          <span>{{ getRotationLabel(facade.activityMetrics().rotationRatio) | translate }}</span>
        </div>
      </section>
```

`added` is already a field on `ActivityMetrics` (`src/app/core/domain/insights/insights-free.domain.ts:22`, computed at line 107/112) and was already exposed on `facade.activityMetrics()` — it was simply never rendered until now. `insights.activity.added` ("Añadidos") already exists in all 6 i18n locale files (verify: `grep -n '"added"' src/assets/i18n/es.json` under the `activity` block) — **no i18n changes needed for this task.** No domain, no `.ts` changes — this is a template-only edit. `formatPercent()` stays used elsewhere in this same file (Section 6, "Calidad del inventario") so it does not become a dead method.

- [ ] **Step 2: Compile check**

Run: `npx ng build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/insights/insights.component.html
git commit -m "refactor(insights): de-dupe waste stats from the activity card, surface 'added' instead"
```

---

## Task 7 (follow-up): rotation % as the headline, not raw added/consumed counts

**User feedback after Task 6:** two raw counts side by side ("Añadidos 8, Consumidos 3") don't say anything on their own — every sibling card on this page (Cobertura estimada, Calidad del inventario, the waste card) leads with one synthesized number + an explanatory sentence, not scattered counts. Fix: make the headline the rotation percentage (`consumed / added`), with a sentence underneath giving the raw counts as context, and a genuine empty state for zero activity (there's an unused `insights.activity.noActivity` i18n key sitting in all 6 locales for exactly this — never wired up).

This requires exposing a raw ratio from the domain (`computeActivityMetrics` currently only buckets into `'high'|'medium'|'low'`, no percentage). While touching that function, also remove `expired`/`wasteRatio` from `ActivityMetrics` — after Task 6, nothing in the app reads either field anymore (verified via `grep -rn "activityMetrics()\." src/app` — only `added`, `consumed`, `rotationRatio` are read anywhere); leaving them would be computing dead output every call.

**Files:**
- Modify: `src/app/core/domain/insights/insights-free.domain.ts`
- Modify: `src/app/core/domain/insights/insights-free.domain.spec.ts`
- Modify: `src/app/features/insights/insights.component.html`
- Modify: `src/app/features/insights/insights.component.scss`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Domain — replace `expired`/`wasteRatio` with `rotationPercent`**

In `insights-free.domain.ts`, the `ActivityMetrics` interface currently reads:

```ts
export interface ActivityMetrics {
  added: number;
  consumed: number;
  expired: number;
  wasteRatio: number | null;
  rotationRatio: 'high' | 'medium' | 'low' | null;
  windowDays: number;
}
```

Replace with:

```ts
export interface ActivityMetrics {
  added: number;
  consumed: number;
  rotationRatio: 'high' | 'medium' | 'low' | null;
  rotationPercent: number | null;
  windowDays: number;
}
```

`computeActivityMetrics` currently reads:

```ts
export function computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date,
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

  // Rotation = consumed / added: what fraction of what you add do you actually use.
  // Old metric (consumed / currentInventory) was wrong — it mixed event-window
  // counts against a point-in-time snapshot, producing inflated ratios.
  let rotationRatio: 'high' | 'medium' | 'low' | null = null;
  if (consumed > 0 || added > 0) {
    if (added === 0) {
      rotationRatio = 'high'; // consuming from pre-existing stock, nothing new added
    } else {
      const ratio = consumed / added;
      if (ratio >= 0.6) rotationRatio = 'high';
      else if (ratio >= 0.25) rotationRatio = 'medium';
      else rotationRatio = 'low';
    }
  }

  return { added, consumed, expired, wasteRatio, rotationRatio, windowDays };
}
```

Replace with:

```ts
export function computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date,
): ActivityMetrics {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  let added = 0;
  let consumed = 0;

  for (const e of recent) {
    if (e.eventType === 'ADD') added += 1;
    else if (e.eventType === 'CONSUME') consumed += 1;
  }

  // Rotation = consumed / added: what fraction of what you add do you actually use.
  // Old metric (consumed / currentInventory) was wrong — it mixed event-window
  // counts against a point-in-time snapshot, producing inflated ratios.
  let rotationRatio: 'high' | 'medium' | 'low' | null = null;
  let rotationPercent: number | null = null;
  if (consumed > 0 || added > 0) {
    if (added === 0) {
      rotationRatio = 'high'; // consuming from pre-existing stock, nothing new added
    } else {
      rotationPercent = consumed / added;
      if (rotationPercent >= 0.6) rotationRatio = 'high';
      else if (rotationPercent >= 0.25) rotationRatio = 'medium';
      else rotationRatio = 'low';
    }
  }

  return { added, consumed, rotationRatio, rotationPercent, windowDays };
}
```

- [ ] **Step 2: Update the domain spec**

In `insights-free.domain.spec.ts`, the `describe('computeActivityMetrics', ...)` block currently has (in this order): a `'counts ADD events...'` test, a `'counts CONSUME events...'` test, a `'counts EXPIRE events...'` test, three `wasteRatio` tests, then a nested `describe('rotationRatio', ...)` with 4 tests. Remove the `'counts EXPIRE events within window'` test and all three `wasteRatio` tests (`is null when no consumed or expired`, `is 0 when consumed > 0 and expired = 0`, `is 1 when expired > 0 and consumed = 0`). Replace the nested `describe('rotationRatio', ...)` block with:

```ts
  describe('rotationRatio and rotationPercent', () => {
    const recentTs = new Date('2026-04-20').toISOString();
    const now = new Date('2026-05-14');

    it('are both null when there is no recent activity', () => {
      const result = computeActivityMetrics([], 30, now);
      expect(result.rotationRatio).toBeNull();
      expect(result.rotationPercent).toBeNull();
    });

    it('rotationRatio is high and rotationPercent is null when consuming with nothing newly added', () => {
      const events = Array.from({ length: 6 }, () =>
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs })
      );
      // 6 consumed / 0 added → consuming pre-existing stock → high, but no ratio to show
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('high');
      expect(result.rotationPercent).toBeNull();
    });

    it('is medium when consumed / added is between 0.25 and 0.6', () => {
      const events = [
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs }),
        ...Array.from({ length: 3 }, () =>
          makeEvent({ eventType: 'ADD', timestamp: recentTs })
        ),
      ];
      // 1 consumed / 3 added ≈ 0.33 → medium
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('medium');
      expect(result.rotationPercent).toBeCloseTo(1 / 3);
    });

    it('is low when consumed / added < 0.25', () => {
      const events = [
        makeEvent({ eventType: 'CONSUME', timestamp: recentTs }),
        ...Array.from({ length: 5 }, () =>
          makeEvent({ eventType: 'ADD', timestamp: recentTs })
        ),
      ];
      // 1 consumed / 5 added = 0.2 → low
      const result = computeActivityMetrics(events, 30, now);
      expect(result.rotationRatio).toBe('low');
      expect(result.rotationPercent).toBe(0.2);
    });
  });
```

The two remaining top-level tests (`'counts ADD events within window'`, `'counts CONSUME events within window'`) stay as-is.

- [ ] **Step 3: Redesign Section 4's template**

In `insights.component.html`, Section 4 currently (post-Task-6) reads:

```html
      <!-- SECTION 4: Últimos 30 días — consumption behavior only; waste has its own card above (Section 1), no need to repeat it here -->
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
        </div>
        <div class="rotation-badge">
          <ion-icon name="refresh-outline"></ion-icon>
          <span>{{ getRotationLabel(facade.activityMetrics().rotationRatio) | translate }}</span>
        </div>
      </section>
```

Replace with:

```html
      <!-- SECTION 4: Últimos 30 días — rotation: how much of what you add you actually consume -->
      <section class="insights-section">
        <h3 class="insights-section__title">{{ 'insights.activity.title' | translate }}</h3>
        @if (facade.activityMetrics().added === 0 && facade.activityMetrics().consumed === 0) {
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
            <span>{{ getRotationLabel(facade.activityMetrics().rotationRatio) | translate }}</span>
          </div>
        }
      </section>
```

`formatPercent()` and `getRotationLabel()` are pre-existing methods on `insights.component.ts`, untouched by this task — same ones already used elsewhere in this file.

- [ ] **Step 4: Update styles — new classes, drop dead ones**

In `insights.component.scss`, remove the (now unused after Step 3) `.activity-row` and `.activity-stat` rules:

```scss
.activity-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: var(--app-theme-spacing-md-plus);
}

.activity-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-theme-spacing-xs);

  &__value {
    font-size: var(--app-theme-font-size-2xl);
    font-weight: var(--app-theme-font-weight-extra-bold);
  }

  &__label {
    font-size: var(--app-theme-font-size-micro);
    color: var(--app-theme-text-subtle);
  }
}
```

Replace that whole block with:

```scss
.activity-headline {
  font-size: var(--app-theme-font-size-title);
  font-weight: var(--app-theme-font-weight-bold);
  margin: 0;
}

.activity-detail {
  font-size: var(--app-theme-font-size-small);
  color: var(--app-theme-text-subtle);
  margin: var(--app-theme-spacing-2xs) 0 0;
}

.activity-empty {
  font-size: var(--app-theme-font-size-small);
  color: var(--app-theme-text-subtle);
  margin: 0;
}
```

(Mirrors the existing `.coverage-card__value`/`.coverage-card__hint` sizing tokens elsewhere in this same file, for visual consistency with Section 3 right above it.)

- [ ] **Step 5: i18n — add 2 keys, remove 5 dead ones**

In each of `src/assets/i18n/{es,en,de,fr,it,pt}.json`, inside the existing `"activity": { ... }` object:

Remove: `"added"`, `"consumed"`, `"expired"`, `"wasteRatio"`, `"noWaste"` (all five are now unreferenced anywhere in `src/app` — verify with `grep -rn "insights.activity.added\|insights.activity.consumed\|insights.activity.expired\|insights.activity.wasteRatio\|insights.activity.noWaste" src/app` before removing, it should return nothing after Step 3 is applied).

Add:
- es: `"detail": "Consumiste {{consumed}} de {{added}} productos añadidos este mes"`, `"detailNoAdds": "Consumiste {{consumed}} productos sin añadir nada nuevo este mes"`
- en: `"detail": "You used {{consumed}} of the {{added}} products you added this month"`, `"detailNoAdds": "You used {{consumed}} products without adding anything new this month"`
- de: `"detail": "Du hast {{consumed}} von {{added}} hinzugefügten Produkten diesen Monat verbraucht"`, `"detailNoAdds": "Du hast {{consumed}} Produkte verbraucht, ohne diesen Monat etwas Neues hinzuzufügen"`
- fr: `"detail": "Tu as consommé {{consumed}} des {{added}} produits ajoutés ce mois-ci"`, `"detailNoAdds": "Tu as consommé {{consumed}} produits sans rien ajouter de nouveau ce mois-ci"`
- it: `"detail": "Hai consumato {{consumed}} dei {{added}} prodotti aggiunti questo mese"`, `"detailNoAdds": "Hai consumato {{consumed}} prodotti senza aggiungere nulla di nuovo questo mese"`
- pt: `"detail": "Consumiste {{consumed}} dos {{added}} produtos adicionados este mês"`, `"detailNoAdds": "Consumiste {{consumed}} produtos sem adicionar nada de novo este mês"`

Keep `"title"`, `"noActivity"`, `"rotationHigh"`, `"rotationMedium"`, `"rotationLow"`, `"rotationNone"` untouched — all still used.

- [ ] **Step 6: Compile check + run the domain spec**

Run: `npx ng build` — expected to succeed.
Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/insights-free.domain.spec.ts'` (or the project's standard single-file test invocation — check `.claude/DEV.md` if this exact flag differs) — all `computeActivityMetrics` tests should pass, none should reference removed fields.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/domain/insights/insights-free.domain.ts src/app/core/domain/insights/insights-free.domain.spec.ts src/app/features/insights/insights.component.html src/app/features/insights/insights.component.scss src/assets/i18n/
git commit -m "refactor(insights): headline rotation % instead of raw added/consumed counts"
```
