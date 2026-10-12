# Shopping List Flat View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shopping list defaults to a flat (ungrouped) view instead of always grouping by
supermarket, with a toolbar toggle to switch to grouped view — mirroring the toggle Despensa
already has for category grouping — plus a new analytics event to see how often people actually
use the grouped view before investing further in it.

**Architecture:** One new boolean signal + toggle method on `ListStateService` (exact same shape
as `PantryStateService.groupByCategory`/`toggleGroupByCategory`), one new analytics event, and a
template change that wraps the existing grouped-rendering block in an `@if`/`@else` — the `@else`
branch renders the same row markup already written for grouped mode, just iterating the flat
`state.suggestions` array (which already exists, computed alongside `groupedSuggestions`) instead
of walking groups. No new domain function, no new model field.

**Tech Stack:** Angular 20 standalone components, signals, `@ngx-translate/core`.

Design doc: `docs/superpowers/specs/2026-09-30-shopping-list-flat-view-design.md`.

---

## Before you start

Run from the repo root (`/Users/fernandodelolmomartin/Repos/pantry-manager`), on branch
`release/5.6`. Confirm clean tree first:

```bash
git status --short
```

If anything is uncommitted that isn't yours, stop and ask — don't touch it.

---

### Task 1: State + analytics event

**Files:**
- Modify: `src/app/core/constants/analytics/events.constants.ts`
- Modify: `src/app/core/services/list/list-state.service.ts`

- [ ] **Step 1: Add the analytics event**

In `src/app/core/constants/analytics/events.constants.ts`, find the `// Shopping list` section
(currently ends with `SHOPPING_BASIC_RESTORED: 'shopping_basic_restored',`) and add one more line
right after it:

```ts
  SHOPPING_BASIC_RESTORED: 'shopping_basic_restored',
  SHOPPING_GROUPING_TOGGLED: 'shopping_grouping_toggled',
```

- [ ] **Step 2: Add the signal and toggle method**

In `src/app/core/services/list/list-state.service.ts`, find this block (right after the class
field declarations, near `readonly isSharingListInProgress = signal(false);`):

```ts
  readonly isSharingListInProgress = signal(false);
```

Add right after it:

```ts
  readonly isSharingListInProgress = signal(false);
  /** Flat by default; no persistence (same as Despensa's groupByCategory) — revisit once
   * shopping_grouping_toggled shows whether people actually use grouped view. */
  readonly groupBySupermarket = signal(false);

  toggleGroupBySupermarket(): void {
    this.groupBySupermarket.update(v => !v);
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_GROUPING_TOGGLED, { grouped: this.groupBySupermarket() });
  }
```

(`ANALYTICS_EVENTS` and `this.analytics` are already imported/injected in this file — no new
imports needed.)

- [ ] **Step 3: Verify**

```bash
npx ng lint
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: lint 0 errors, all tests pass (no test targets `groupBySupermarket` yet — deliberately,
matching the fact that Despensa's own `groupByCategory`/`toggleGroupByCategory` has zero test
coverage today; this is a trivial signal toggle with an analytics side-effect, not business logic
worth a dedicated spec, consistent with the existing precedent), build succeeds. Nothing in the
template reads `groupBySupermarket` yet, so this step is pure additive plumbing — Task 2 wires it
in.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/constants/analytics/events.constants.ts src/app/core/services/list/list-state.service.ts
git commit -m "feat(shopping): add groupBySupermarket toggle state

Same shape as PantryStateService's existing groupByCategory/
toggleGroupByCategory — a flat, unpersisted signal plus an
analytics-tracked toggle. Not wired into the template yet."
```

---

### Task 2: Toggle button + flat rendering + i18n

**Files:**
- Modify: `src/app/features/list/list.component.html`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Add the toggle button to the toolbar**

In `src/app/features/list/list.component.html`, replace:

```html
    <ion-buttons slot="end">
      <ion-button
        (click)="facade.openShareMenu()"
        [disabled]="facade.loading() || facade.isSharingListInProgress() || (!facade.shoppingAnalysis().summary.total && !facade.visibleManualItems().length)"
        [attr.aria-label]="'shopping.share.button' | translate">
```

with:

```html
    <ion-buttons slot="end">
      @if (facade.shoppingAnalysis().summary.total) {
        <ion-button
          (click)="facade.toggleGroupBySupermarket()"
          [attr.aria-label]="(facade.groupBySupermarket() ? 'shopping.groupToggle.grouped' : 'shopping.groupToggle.flat') | translate">
          <ion-icon slot="icon-only" [name]="facade.groupBySupermarket() ? 'list-outline' : 'apps-outline'"></ion-icon>
        </ion-button>
      }
      <ion-button
        (click)="facade.openShareMenu()"
        [disabled]="facade.loading() || facade.isSharingListInProgress() || (!facade.shoppingAnalysis().summary.total && !facade.visibleManualItems().length)"
        [attr.aria-label]="'shopping.share.button' | translate">
```

(The toggle is hidden when `summary.total` is 0 — nothing to group/flatten with zero
suggestions, same reasoning Despensa uses to hide its own toggle when the section is empty.)

- [ ] **Step 2: Branch the grouped-rendering block on the new signal**

In the same file, find the block that starts with:

```html
        @for (group of state.groupedSuggestions; track group.key) {
```

and ends with the closing `}` right before the `<!-- Synthetic unassigned group: -->` comment's
own `@if` block closes (i.e. everything from `@for (group of state.groupedSuggestions...` through
the matching `}` of the synthetic-unassigned-group `@if`, lines 51–163 of the current file). Wrap
that ENTIRE existing block — unchanged — in `@if (facade.groupBySupermarket()) { ... }`, and add a
new `@else` branch right after it with the flat rendering:

```html
        @if (facade.groupBySupermarket()) {
          @for (group of state.groupedSuggestions; track group.key) {
            @let groupManuals = (group.key === UNASSIGNED_KEY) ? facade.visibleManualItems() : [];
            @if (group.suggestions.length || groupManuals.length) {
              <div class="suggestion-group">

                <!-- Group header -->
                <button class="supermarket-heading pressable" (click)="toggleGroup(group.key)">
                  <span>{{ group.label }}</span>
                  <ion-badge class="group-count group-count--medium">{{ group.suggestions.length + groupManuals.length }}</ion-badge>
                  <ion-icon
                    class="collapse-icon"
                    [class.collapse-icon--expanded]="!isGroupCollapsed(group.key)"
                    name="chevron-down-outline">
                  </ion-icon>
                </button>

                @if (!isGroupCollapsed(group.key)) {
                  <ion-list class="item-list" lines="none">
                    @for (suggestion of group.suggestions; track facade.getSuggestionTrackId(suggestion)) {
                      <ion-item
                        detail="false"
                        role="button"
                        tabindex="0"
                        class="suggestion-item pressable"
                        [class.suggestion-item--exiting]="isExiting(suggestion.item._id)"
                        (click)="facade.openRowActions({ kind: 'auto', id: suggestion.item._id, name: suggestion.item.name })">
                        <div class="item-body" slot="start">
                          <span class="item-name">{{ suggestion.item.name }}</span>
                          @let detail = suggestionDetail(suggestion);
                          @if (detail) {
                            <span class="item-qty">{{ detail.key | translate:detail.params }}</span>
                          }
                        </div>
                        <ion-button
                          slot="end"
                          fill="solid"
                          [color]="(suggestion.reason === 'fresh-empty' || suggestion.reason === 'fresh-low') ? 'success' : 'primary'"
                          shape="round"
                          class="buy-btn"
                          (click)="$event.stopPropagation(); onBuyTap(suggestion)">
                          <ion-icon
                            slot="icon-only"
                            [name]="(suggestion.reason === 'fresh-empty' || suggestion.reason === 'fresh-low') ? 'leaf-outline' : 'cart-outline'">
                          </ion-icon>
                        </ion-button>
                      </ion-item>
                    }
                    @for (manual of groupManuals; track manual.id) {
                      <ion-item
                        detail="false"
                        role="button"
                        tabindex="0"
                        class="suggestion-item pressable"
                        (click)="facade.openRowActions({ kind: 'manual', id: manual.id, name: manual.name })">
                        <div class="item-body" slot="start">
                          <span class="item-name">{{ manual.name }}</span>
                        </div>
                        <ion-button
                          slot="end"
                          fill="solid"
                          color="primary"
                          shape="round"
                          class="buy-btn"
                          (click)="$event.stopPropagation(); buySheet.openSheetForManual(manual.id, manual.name)">
                          <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
                        </ion-button>
                      </ion-item>
                    }
                  </ion-list>
                }
              </div>
            }
          }

          <!-- Synthetic unassigned group: manual items only, no auto suggestions without supermarket -->
          @if (facade.visibleManualItems().length && !hasUnassignedAutoGroup(state.groupedSuggestions)) {
            <div class="suggestion-group">
              <button class="supermarket-heading pressable" (click)="toggleGroup(UNASSIGNED_KEY)">
                <span>{{ 'shopping.unassignedSupermarket' | translate }}</span>
                <ion-badge class="group-count group-count--medium">{{ facade.visibleManualItems().length }}</ion-badge>
                <ion-icon
                  class="collapse-icon"
                  [class.collapse-icon--expanded]="!isGroupCollapsed(UNASSIGNED_KEY)"
                  name="chevron-down-outline">
                </ion-icon>
              </button>
              @if (!isGroupCollapsed(UNASSIGNED_KEY)) {
                <ion-list class="item-list" lines="none">
                  @for (manual of facade.visibleManualItems(); track manual.id) {
                    <ion-item
                      detail="false"
                      role="button"
                      tabindex="0"
                      class="suggestion-item pressable"
                      (click)="facade.openRowActions({ kind: 'manual', id: manual.id, name: manual.name })">
                      <div class="item-body" slot="start">
                        <span class="item-name">{{ manual.name }}</span>
                      </div>
                      <ion-button
                        slot="end"
                        fill="solid"
                        color="primary"
                        shape="round"
                        class="buy-btn"
                        (click)="$event.stopPropagation(); buySheet.openSheetForManual(manual.id, manual.name)">
                        <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
                      </ion-button>
                    </ion-item>
                  }
                </ion-list>
              }
            </div>
          }
        } @else {
          <ion-list class="item-list" lines="none">
            @for (suggestion of state.suggestions; track facade.getSuggestionTrackId(suggestion)) {
              <ion-item
                detail="false"
                role="button"
                tabindex="0"
                class="suggestion-item pressable"
                [class.suggestion-item--exiting]="isExiting(suggestion.item._id)"
                (click)="facade.openRowActions({ kind: 'auto', id: suggestion.item._id, name: suggestion.item.name })">
                <div class="item-body" slot="start">
                  <span class="item-name">{{ suggestion.item.name }}</span>
                  @let detail = suggestionDetail(suggestion);
                  @if (detail) {
                    <span class="item-qty">{{ detail.key | translate:detail.params }}</span>
                  }
                </div>
                <ion-button
                  slot="end"
                  fill="solid"
                  [color]="(suggestion.reason === 'fresh-empty' || suggestion.reason === 'fresh-low') ? 'success' : 'primary'"
                  shape="round"
                  class="buy-btn"
                  (click)="$event.stopPropagation(); onBuyTap(suggestion)">
                  <ion-icon
                    slot="icon-only"
                    [name]="(suggestion.reason === 'fresh-empty' || suggestion.reason === 'fresh-low') ? 'leaf-outline' : 'cart-outline'">
                  </ion-icon>
                </ion-button>
              </ion-item>
            }
            @for (manual of facade.visibleManualItems(); track manual.id) {
              <ion-item
                detail="false"
                role="button"
                tabindex="0"
                class="suggestion-item pressable"
                (click)="facade.openRowActions({ kind: 'manual', id: manual.id, name: manual.name })">
                <div class="item-body" slot="start">
                  <span class="item-name">{{ manual.name }}</span>
                </div>
                <ion-button
                  slot="end"
                  fill="solid"
                  color="primary"
                  shape="round"
                  class="buy-btn"
                  (click)="$event.stopPropagation(); buySheet.openSheetForManual(manual.id, manual.name)">
                  <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }
          </ion-list>
        }
```

Everything below this block — the "Comprado" and "Ignorados" global sections (lines 165–218 of
the original file) — is untouched, stays exactly where it is, outside this `@if`/`@else`, and
renders identically in both flat and grouped mode.

- [ ] **Step 3: Add the new i18n keys, all 6 bundles**

Add a `groupToggle` object under the existing `shopping` object in
`src/assets/i18n/{es,en,de,fr,it,pt}.json` (anywhere inside `shopping`, e.g. right after
`unassignedSupermarket`):

`es.json`:
```json
"groupToggle": {
  "flat": "Agrupar por supermercado",
  "grouped": "Vista plana"
}
```

`en.json`: `"flat": "Group by supermarket"`, `"grouped": "Flat list"`.
`de.json`: `"flat": "Nach Supermarkt gruppieren"`, `"grouped": "Listenansicht"`.
`fr.json`: `"flat": "Grouper par supermarché"`, `"grouped": "Vue liste"`.
`it.json`: `"flat": "Raggruppa per supermercato"`, `"grouped": "Vista lista"`.
`pt.json`: `"flat": "Agrupar por supermercado"`, `"grouped": "Vista plana"`.

(Same key shape and same aria-label-describes-the-action convention as Despensa's
`pantry.sections.groupToggle` — the label says what tapping the button DOES, not the current
state.)

Every other pre-existing key in each bundle must stay untouched; each file must remain valid
JSON.

- [ ] **Step 4: Verify**

```bash
npx ng lint
node scripts/check-icons.mjs
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: lint 0 errors, check-icons clean (`list-outline`/`apps-outline` are already registered
— confirmed, Despensa's toggle already uses them — so no change needed in `app-icons.ts`), tests
pass, build succeeds.

- [ ] **Step 5: Verify in the browser**

Start the dev server, open the shopping list tab with at least 2 different supermarkets among
the suggested products plus one manual item with no supermarket set (use the
`ng.getComponent(document.querySelector('app-root')).pantryStore.updateItem(...)` console trick
to set a `supermarket` value on a couple of pantry items if you don't have real data set up, then
add a manual item through the UI). Confirm:
- The list opens in flat view by default — all suggestions and the manual item in one
  continuous list, no group headers.
- The toggle button appears in the header next to share/settings, with the `apps-outline` icon.
- Tapping it switches to grouped view (icon becomes `list-outline`, items now split under
  supermarket headers, manual item under "sin asignar").
- Tapping again returns to flat view.
- "Comprado" / "Ignorados" sections (if any items are there) look and behave identically in
  both modes.
- Buying an item, opening row actions, and the manual-add flow all still work the same in flat
  view as they did in grouped view (same click handlers, just different iteration).
- With an empty list (no suggestions, no manual items), the toggle button doesn't render.
- Reload the page (or leave and re-enter the tab) — view resets to flat (no persistence, as
  designed).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/list/list.component.html src/assets/i18n/
git commit -m "feat(shopping): flat view by default, with a toggle to grouped

Mirrors Despensa's groupByCategory toggle. The flat branch reuses the
exact row markup the grouped branch already had — no new domain
function, the ungrouped ShoppingState.suggestions array already
existed alongside groupedSuggestions, just wasn't rendered before."
```

---

## Self-Review Notes (already applied above, kept for the reviewer)

- **Spec coverage:** flat-by-default (Task 2 Step 2's `@else` branch, no persistence — Task 1
  Step 2's comment states this explicitly), toggle button reusing Despensa's icons (Task 2 Step
  1), new analytics event mirroring `PANTRY_GROUPING_TOGGLED`'s shape (Task 1 Step 1), i18n
  following Despensa's aria-label convention (Task 2 Step 3), "Comprado"/"Ignorados" and
  `collapsedGroups`/`toggleGroup` untouched (explicitly called out in Task 2 Step 2).
- **Dead code:** none created — `groupSuggestionsBySupermarket()`/`buildShoppingAnalysis()` are
  untouched (both outputs already existed, this plan just renders a second one of the two).
- **Type consistency:** `state.suggestions` (`ShoppingState.suggestions`,
  `list.model.ts:48`) is the exact same `ShoppingSuggestionWithItem[]` type each grouped
  `group.suggestions` array already holds, so the flat branch's `<ion-item>` bindings
  (`suggestion.item._id`, `suggestion.item.name`, `suggestion.reason`) need no adaptation —
  copied verbatim from the existing grouped-branch markup.
