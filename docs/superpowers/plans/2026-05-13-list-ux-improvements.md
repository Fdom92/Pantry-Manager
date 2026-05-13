# List UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Comprado" section bug for auto-items, add an "Ignorados" section (same pattern as "Comprado"), isolate the buy action to a primary circular button, and add educational toasts on all key actions.

**Architecture:** All changes are confined to the existing list feature files. `buildShoppingAnalysis` loop order is fixed (bought check before shouldAutoAdd). `ignoredItems: BoughtItem[]` is added to the group model and distributed the same way as `boughtItems`. `ToastController` is injected into `ListStateService`. No new services or files.

**Tech Stack:** Angular 20 signals, Ionic 8 (`ToastController`, `ion-item-sliding`, `ion-button`), @ngx-translate, TypeScript.

---

## File Map

| File | Change |
|---|---|
| `src/app/core/models/list/list.model.ts` | Add `ignoredItems: BoughtItem[]` to `ShoppingSuggestionGroup` |
| `src/app/core/utils/list-grouping.util.ts` | Initialize `ignoredItems: []` alongside `boughtItems: []` |
| `src/app/core/services/list/list-state.service.ts` | Reorder loop, track `ignoredAutoItems`, distribute to groups, inject `ToastController`, add `showToast`, update action methods |
| `src/app/features/list/list.component.ts` | Add `collapsedIgnoredSections` signal + `toggleIgnoredSection` / `isIgnoredSectionExpanded`, clear in `ionViewWillLeave` |
| `src/app/features/list/list.component.html` | Isolated buy button, ignored section per group, swipe icon from trash to eye-off |
| `src/app/features/list/list.component.scss` | `.buy-btn`, `.ignored-section`, `.ignored-section-header`, `.ignored-list`, `.ignored-item`, `.ignored-name`; remove unused `.cart-icon` |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` | `shopping.ignored.*`, `shopping.toasts.*` |

---

## Task 1: Model — add `ignoredItems` to `ShoppingSuggestionGroup`

**Files:**
- Modify: `src/app/core/models/list/list.model.ts`

- [ ] **Step 1: Add `ignoredItems` field to `ShoppingSuggestionGroup`**

Replace the `ShoppingSuggestionGroup` interface (lines 34–39) with:

```typescript
export interface ShoppingSuggestionGroup<TItem = string> {
  key: string;
  label: string;
  suggestions: ShoppingSuggestion<TItem>[];
  boughtItems: BoughtItem[];
  ignoredItems: BoughtItem[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep -E "list\.(model|grouping|state)" | head -20
```

Expected: one error in `list-grouping.util.ts` about `ignoredItems` missing (fixed in Task 2). No other errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/list/list.model.ts
git commit -m "feat(list): add ignoredItems to ShoppingSuggestionGroup model"
```

---

## Task 2: Grouping util — initialize `ignoredItems`

**Files:**
- Modify: `src/app/core/utils/list-grouping.util.ts`

- [ ] **Step 1: Add `ignoredItems: []` to the group object in `.map()`**

Replace line 25 (the `return { key, label, suggestions: list, boughtItems: [] };` line) with:

```typescript
    return { key, label, suggestions: list, boughtItems: [], ignoredItems: [] };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep -E "list\.(model|grouping|state)" | head -20
```

Expected: the `list-grouping.util.ts` error is gone. Any remaining errors are in `list-state.service.ts` for the group push calls that now need `ignoredItems` — those are fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/utils/list-grouping.util.ts
git commit -m "feat(list): initialize ignoredItems array in groupSuggestionsBySupermarket"
```

---

## Task 3: Service — reorder loop, ignored tracking, toasts

**Files:**
- Modify: `src/app/core/services/list/list-state.service.ts`

- [ ] **Step 1: Add `ToastController` import and injection**

Add `ToastController` to the `@ionic/angular` import line (currently line ~0, but there's no Ionic import yet — add a new import):

```typescript
import { ToastController } from '@ionic/angular';
```

Inside the class body, add after the existing `inject` calls (after `private readonly share = inject(ShareService);`):

```typescript
  private readonly toastController = inject(ToastController);
```

- [ ] **Step 2: Rewrite `buildShoppingAnalysis` — fix loop order + add ignoredAutoItems**

Replace the entire `private buildShoppingAnalysis(...)` method with:

```typescript
  private buildShoppingAnalysis(
    items: PantryItem[],
    boughtIds: Set<string>,
    removedIds: Set<string>,
    _manualItems: ManualItem[], // tracked as signal dep so computed re-runs; rendered directly in template
    boughtManuals: BoughtItem[],
  ): ShoppingStateWithItem {
    const pendingSuggestions: ShoppingSuggestionWithItem[] = [];
    const boughtAutoItems: BoughtItem[] = [];
    const ignoredAutoItems: BoughtItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    let summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      empty: 0,
      supermarketCount: 0,
      boughtCount: 0,
    };

    for (const item of items) {
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      const supermarket = normalizeSupermarketValue(item.supermarket);
      const id = item._id;

      // Check bought FIRST — item stays in "Comprado" even after restock
      if (boughtIds.has(id)) {
        boughtAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
        continue;
      }

      const shouldAutoAdd = this.pantryStore.shouldAutoAddToShoppingList(item, {
        totalQuantity,
        minThreshold,
      });

      if (!shouldAutoAdd) {
        continue;
      }

      // Track ignored items so they appear in the "Ocultos ahora" section
      if (removedIds.has(id)) {
        ignoredAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
        continue;
      }

      const { reason, suggestedQuantity } = determineSuggestionNeed({
        totalQuantity,
        minThreshold,
        isFresh: item.productType === 'fresh',
      });

      if (reason) {
        if (supermarket) {
          uniqueSupermarkets.add(normalizeLowercase(supermarket));
        }
        pendingSuggestions.push({
          item,
          reason,
          suggestedQuantity,
          currentQuantity: roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
          supermarket: supermarket || undefined,
        });
        summary = incrementSummary(summary, reason);
      }
    }

    summary.total = pendingSuggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    summary.boughtCount = boughtAutoItems.length + boughtManuals.length;

    const unassignedLabel = this.translate.instant('shopping.unassignedSupermarket');
    const groupedSuggestions = groupSuggestionsBySupermarket({
      suggestions: pendingSuggestions,
      labelForUnassigned: unassignedLabel,
    });

    const sortedGroups = groupedSuggestions.map(group => ({
      ...group,
      suggestions: sortSuggestionsByUrgency(group.suggestions),
    }));

    // Distribute bought auto items into their supermarket groups
    for (const boughtItem of boughtAutoItems) {
      const groupKey = normalizeLowercase(boughtItem.supermarket) || UNASSIGNED_SUPERMARKET_KEY;
      const group = sortedGroups.find(g => g.key === groupKey);
      if (group) {
        group.boughtItems.push(boughtItem);
      } else {
        sortedGroups.push({
          key: groupKey,
          label: boughtItem.supermarket ?? unassignedLabel,
          suggestions: [],
          boughtItems: [boughtItem],
          ignoredItems: [],
        });
      }
    }

    // Distribute ignored auto items into their supermarket groups
    for (const ignoredItem of ignoredAutoItems) {
      const groupKey = normalizeLowercase(ignoredItem.supermarket) || UNASSIGNED_SUPERMARKET_KEY;
      const group = sortedGroups.find(g => g.key === groupKey);
      if (group) {
        group.ignoredItems.push(ignoredItem);
      } else {
        sortedGroups.push({
          key: groupKey,
          label: ignoredItem.supermarket ?? unassignedLabel,
          suggestions: [],
          boughtItems: [],
          ignoredItems: [ignoredItem],
        });
      }
    }

    return { suggestions: pendingSuggestions, groupedSuggestions: sortedGroups, summary };
  }
```

- [ ] **Step 3: Update `markAsBought` to show success toast**

Replace the existing `markAsBought` method with:

```typescript
  async markAsBought(suggestion: ShoppingSuggestionWithItem): Promise<void> {
    const id = suggestion.item._id;
    const name = suggestion.item.name;
    this.boughtItemIds.update(set => new Set([...set, id]));

    const qty = suggestion.reason === ShoppingReason.FRESH_EMPTY
      ? FRESH_QTY.sufficient
      : suggestion.suggestedQuantity;

    try {
      await this.pantryStore.addNewLot(id, { quantity: qty });
      void this.showToast(this.translate.instant('shopping.toasts.bought', { name }));
    } catch (err) {
      console.error('[ListStateService] markAsBought: addNewLot failed', err);
      this.boughtItemIds.update(set => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }
```

- [ ] **Step 4: Update `markManualAsBought` to show toast**

Replace the existing `markManualAsBought` method with:

```typescript
  markManualAsBought(id: string): void {
    const item = this.manualItems().find(m => m.id === id);
    if (!item) return;
    this.manualItems.update(list => list.filter(m => m.id !== id));
    this.boughtManuals.update(list => [...list, { id, name: item.name }]);
    void this.showToast(this.translate.instant('shopping.toasts.boughtManual', { name: item.name }));
  }
```

- [ ] **Step 5: Update `removeAutoItem` to show toast**

Replace the existing `removeAutoItem` method with:

```typescript
  removeAutoItem(id: string): void {
    const name = this.items().find(i => i._id === id)?.name ?? '';
    this.removedAutoIds.update(set => new Set([...set, id]));
    void this.showToast(this.translate.instant('shopping.toasts.ignored', { name }));
  }
```

- [ ] **Step 6: Update `removeManualItem` to show toast**

Replace the existing `removeManualItem` method with:

```typescript
  removeManualItem(id: string): void {
    const item = this.manualItems().find(m => m.id === id);
    this.manualItems.update(list => list.filter(m => m.id !== id));
    if (item) {
      void this.showToast(this.translate.instant('shopping.toasts.removedManual', { name: item.name }));
    }
  }
```

- [ ] **Step 7: Add private `showToast` helper**

Add after `addManualItem` (before `getSuggestionTrackId`):

```typescript
  private async showToast(message: string, duration = 2500): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration,
      position: 'bottom',
    });
    await toast.present();
  }
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -v "backend/" | grep "error TS" | head -20
```

Expected: only the three pre-existing `core/index.ts` errors. Zero new errors in list files.

- [ ] **Step 9: Commit**

```bash
git add src/app/core/services/list/list-state.service.ts
git commit -m "feat(list): fix bought-section bug, add ignored tracking, add toasts to actions"
```

---

## Task 4: Component — ignored section helpers

**Files:**
- Modify: `src/app/features/list/list.component.ts`

- [ ] **Step 1: Add `collapsedIgnoredSections` signal and helpers**

After the `collapsedBoughtSections` signal (line 30), add:

```typescript
  private readonly collapsedIgnoredSections = signal<Set<string>>(new Set());
```

After `isBoughtSectionExpanded`, add:

```typescript
  toggleIgnoredSection(key: string): void {
    this.collapsedIgnoredSections.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isIgnoredSectionExpanded(key: string): boolean {
    return this.collapsedIgnoredSections().has(key);
  }
```

- [ ] **Step 2: Clear `collapsedIgnoredSections` in `ionViewWillLeave`**

Update `ionViewWillLeave` to also clear the new signal:

```typescript
  async ionViewWillLeave(): Promise<void> {
    await this.facade.ionViewWillLeave();
    this.collapsedGroups.set(new Set());
    this.collapsedBoughtSections.set(new Set());
    this.collapsedIgnoredSections.set(new Set());
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep "list.component" | head -10
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/list/list.component.ts
git commit -m "feat(list): add collapsedIgnoredSections signal and ignored section helpers"
```

---

## Task 5: i18n — new keys

**Files:**
- Modify: `src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`

Add these keys inside `"shopping"` in each file. Do NOT remove existing keys.

- [ ] **Step 1: Add to `es.json`**

Inside `"shopping"`, add:

```json
"ignored": {
  "sectionTitle": "Ocultos ahora"
},
"toasts": {
  "bought": "✓ {{name}} comprado. Inventario actualizado.",
  "boughtManual": "✓ {{name}} comprado.",
  "ignored": "{{name}} oculto por ahora — volverá la próxima vez.",
  "removedManual": "{{name}} eliminado de la lista."
}
```

- [ ] **Step 2: Add to `en.json`**

```json
"ignored": {
  "sectionTitle": "Hidden for now"
},
"toasts": {
  "bought": "✓ {{name}} bought. Inventory updated.",
  "boughtManual": "✓ {{name}} bought.",
  "ignored": "{{name}} hidden for now — it will come back next time.",
  "removedManual": "{{name}} removed from list."
}
```

- [ ] **Step 3: Add to `de.json`**

```json
"ignored": {
  "sectionTitle": "Jetzt ausgeblendet"
},
"toasts": {
  "bought": "✓ {{name}} gekauft. Vorrat aktualisiert.",
  "boughtManual": "✓ {{name}} gekauft.",
  "ignored": "{{name}} jetzt ausgeblendet — erscheint beim nächsten Mal wieder.",
  "removedManual": "{{name}} aus der Liste entfernt."
}
```

- [ ] **Step 4: Add to `fr.json`**

```json
"ignored": {
  "sectionTitle": "Masqués pour l'instant"
},
"toasts": {
  "bought": "✓ {{name}} acheté. Stock mis à jour.",
  "boughtManual": "✓ {{name}} acheté.",
  "ignored": "{{name}} masqué pour l'instant — réapparaîtra la prochaine fois.",
  "removedManual": "{{name}} retiré de la liste."
}
```

- [ ] **Step 5: Add to `it.json`**

```json
"ignored": {
  "sectionTitle": "Nascosti ora"
},
"toasts": {
  "bought": "✓ {{name}} acquistato. Scorta aggiornata.",
  "boughtManual": "✓ {{name}} acquistato.",
  "ignored": "{{name}} nascosto ora — riapparirà la prossima volta.",
  "removedManual": "{{name}} rimosso dalla lista."
}
```

- [ ] **Step 6: Add to `pt.json`**

```json
"ignored": {
  "sectionTitle": "Ocultos agora"
},
"toasts": {
  "bought": "✓ {{name}} comprado. Estoque atualizado.",
  "boughtManual": "✓ {{name}} comprado.",
  "ignored": "{{name}} oculto agora — voltará na próxima vez.",
  "removedManual": "{{name}} removido da lista."
}
```

- [ ] **Step 7: Validate JSON and commit**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && for f in es en de fr it pt; do echo -n "$f: "; python3 -c "import json; json.load(open('src/assets/i18n/$f.json'))" && echo "OK" || echo "INVALID"; done
git add src/assets/i18n/
git commit -m "feat(list): add i18n keys for ignored section and toasts"
```

---

## Task 6: HTML template — buy button, ignored section, swipe icon

**Files:**
- Modify: `src/app/features/list/list.component.html`

- [ ] **Step 1: Isolate buy button — replace the pending `ion-item` block**

Find the pending items `ion-item-sliding` block. The current `ion-item` looks like:

```html
<ion-item
  button
  detail="false"
  class="suggestion-item pressable"
  (click)="facade.markAsBought(suggestion)">
  <div class="item-body" slot="start">
    ...
  </div>
  <ion-icon slot="end" name="cart-outline" color="medium" class="cart-icon"></ion-icon>
</ion-item>
```

Replace it with (remove `button`, `pressable`, and `(click)` from `ion-item`; replace the `ion-icon` with an `ion-button`):

```html
<ion-item
  detail="false"
  class="suggestion-item">
  <div class="item-body" slot="start">
    <span class="item-name">{{ suggestion.item.name }}</span>
    <div class="item-meta">
      @if (suggestion.reason === 'fresh-empty') {
        <ion-badge color="success" class="reason-chip">
          🥬 {{ 'shopping.chips.freshEmpty' | translate }}
        </ion-badge>
      } @else if (suggestion.reason === 'empty') {
        <ion-badge color="danger" class="reason-chip">
          {{ 'shopping.chips.empty' | translate }}
        </ion-badge>
      } @else if (suggestion.reason === 'below-min') {
        <ion-badge color="warning" class="reason-chip">
          {{ 'shopping.chips.belowMin' | translate }}
        </ion-badge>
      }
      @if (suggestion.item.isBasic) {
        <ion-badge color="primary" class="reason-chip reason-chip--basic">
          ⭐ {{ 'shopping.chips.basic' | translate }}
        </ion-badge>
      }
    </div>
    <span class="item-qty">
      @if (suggestion.reason === 'below-min') {
        {{ 'shopping.suggestions.belowMinQty' | translate:{ qty: suggestion.suggestedQuantity } }}
      } @else {
        {{ 'shopping.suggestions.toBuy' | translate:{ amount: suggestion.suggestedQuantity } }}
      }
    </span>
  </div>
  <ion-button
    slot="end"
    fill="solid"
    color="primary"
    shape="round"
    class="buy-btn"
    (click)="facade.markAsBought(suggestion)">
    <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
  </ion-button>
</ion-item>
```

- [ ] **Step 2: Change swipe-end icon for auto-items from trash to eye-off**

Find the `ion-item-options side="end"` block inside the pending items loop. Replace:

```html
<ion-item-options side="end">
  <ion-item-option
    color="danger"
    (click)="facade.removeAutoItem(suggestion.item._id)">
    <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
  </ion-item-option>
</ion-item-options>
```

With:

```html
<ion-item-options side="end">
  <ion-item-option
    color="medium"
    (click)="facade.removeAutoItem(suggestion.item._id)">
    <ion-icon slot="icon-only" name="eye-off-outline"></ion-icon>
  </ion-item-option>
</ion-item-options>
```

- [ ] **Step 3: Add ignored section after the bought section within each group**

After the `@if (group.boughtItems.length) { ... }` block, add:

```html
<!-- Ignored items for this group -->
@if (group.ignoredItems.length) {
  <div class="ignored-section">
    <button
      class="ignored-section-header pressable"
      (click)="toggleIgnoredSection(group.key)">
      <ion-icon name="eye-off-outline" color="medium"></ion-icon>
      <span>{{ 'shopping.ignored.sectionTitle' | translate }}</span>
      <ion-badge color="medium" class="group-count">{{ group.ignoredItems.length }}</ion-badge>
      <ion-icon
        class="collapse-icon"
        [name]="isIgnoredSectionExpanded(group.key) ? 'chevron-down-outline' : 'chevron-forward-outline'">
      </ion-icon>
    </button>
    @if (isIgnoredSectionExpanded(group.key)) {
      <ion-list class="item-list ignored-list" lines="none">
        @for (ignored of group.ignoredItems; track ignored.id) {
          <ion-item detail="false" class="ignored-item">
            <ion-icon slot="start" name="eye-off-outline" color="medium"></ion-icon>
            <span class="item-name ignored-name">{{ ignored.name }}</span>
          </ion-item>
        }
      </ion-list>
    }
  </div>
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep "list.component" | head -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/list/list.component.html
git commit -m "feat(list): isolated buy button, ignored section, eye-off swipe icon"
```

---

## Task 7: SCSS — buy button and ignored section styles

**Files:**
- Modify: `src/app/features/list/list.component.scss`

- [ ] **Step 1: Remove the unused `.cart-icon` rule**

Find and delete this block (introduced in the original redesign, now replaced by the buy button):

```scss
.cart-icon {
  font-size: 1.2rem;
  opacity: 0.4;
}
```

- [ ] **Step 2: Append new styles at the end of the file**

Add:

```scss
// --- Buy button ---
.buy-btn {
  --padding-start: 0;
  --padding-end: 0;
  width: 36px;
  height: 36px;
  margin: 0;
  flex-shrink: 0;
}

// --- Ignored section ---
.ignored-section {
  margin-top: var(--app-theme-spacing-sm);
}

.ignored-section-header {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-sm);
  font-size: 0.9rem;
  color: var(--app-theme-text-muted);
  padding: var(--app-theme-spacing-xs) 0;
}

.ignored-list {
  opacity: 0.5;
}

.ignored-item {
  --padding-start: var(--app-theme-spacing-lg);
}

.ignored-name {
  color: var(--app-theme-text-muted);
}
```

- [ ] **Step 3: Run TypeScript check and commit**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep "list.component" | head -10
git add src/app/features/list/list.component.scss
git commit -m "feat(list): add buy-btn and ignored-section styles, remove unused cart-icon"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Bug fix: bought check before shouldAutoAdd | Task 3 (loop reorder) |
| Comprado section shows for auto-items | Task 3 (boughtAutoItems always populated) |
| ignoredItems field on group | Task 1 |
| ignoredItems initialized in grouping util | Task 2 |
| Ignored items tracked in buildShoppingAnalysis | Task 3 |
| Ignored items distributed to groups | Task 3 |
| collapsedIgnoredSections signal + helpers | Task 4 |
| Clear ignored collapse state on leave | Task 4 |
| Swipe-end icon: eye-off-outline, color=medium | Task 6 |
| Ignored section per group (collapsible) | Task 6 |
| Buy button: isolated, fill=solid, color=primary, shape=round | Task 6 |
| Toast: markAsBought success | Task 3 |
| Toast: markManualAsBought | Task 3 |
| Toast: removeAutoItem | Task 3 |
| Toast: removeManualItem | Task 3 |
| i18n: shopping.ignored.* | Task 5 |
| i18n: shopping.toasts.* | Task 5 |
| SCSS: .buy-btn | Task 7 |
| SCSS: .ignored-section + related | Task 7 |

### Type consistency

- `ignoredItems: BoughtItem[]` defined in Task 1, initialized in Task 2, populated in Task 3, read in Task 6 — consistent
- `toggleIgnoredSection`/`isIgnoredSectionExpanded` defined in Task 4, called in Task 6 — consistent
- `shopping.toasts.*` keys defined in Task 5, used in Task 3 — consistent
- `group.ignoredItems` referenced in Task 6 — matches model from Task 1

### No placeholders: verified ✓
