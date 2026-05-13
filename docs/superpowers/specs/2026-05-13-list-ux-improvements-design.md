# List UX Improvements — Design Spec

**Date:** 2026-05-13
**Branch:** feat/shopping-list-rework
**Scope:** Iterative UX improvements over List Redesign 4.0

---

## Context

Built on top of the List Redesign 4.0 (spec: `2026-05-12-list-redesign-4-0-design.md`). All architecture decisions from that spec still apply.

---

## Changes

### 1. Bug fix — "Comprado" section missing for auto-items

**Root cause:** `buildShoppingAnalysis` checks `shouldAutoAddToShoppingList` before `boughtIds.has(id)`. After `markAsBought` calls `addNewLot`, the item's stock increases, so `shouldAutoAdd` returns `false` on the next computed evaluation. The item exits the loop before reaching the `boughtIds` check and never appears in `boughtAutoItems`.

**Fix:** Reorder loop in `buildShoppingAnalysis`:

```
1. if boughtIds.has(id)    → boughtAutoItems.push(), continue   ← FIRST
2. if !shouldAutoAdd       → continue
3. if removedIds.has(id)   → ignoredAutoItems.push(), continue  ← new
4. if reason exists        → pendingSuggestions.push()
```

This ensures bought items always appear in "Comprado" regardless of current stock level.

---

### 2. "Ignorados" section per supermarket group

Same visual/UX pattern as "Comprado":
- Collapsible, collapsed by default
- Header: `eye-off-outline` icon + "Ocultos ahora" label + count badge + chevron
- Body: list of items with `eye-off-outline` + name, read-only (no actions needed)
- Cleared on `ionViewWillLeave` alongside other ephemeral state

**Model change — `ShoppingSuggestionGroup`:**

```typescript
export interface ShoppingSuggestionGroup<TItem = string> {
  key: string;
  label: string;
  suggestions: ShoppingSuggestion<TItem>[];
  boughtItems: BoughtItem[];
  ignoredItems: BoughtItem[];  // NEW
}
```

`BoughtItem` type is reused (shape is identical: `{ id, name, supermarket? }`).

**Grouping util:** initialize `ignoredItems: []` alongside `boughtItems: []`.

**Service:** track `ignoredAutoItems: BoughtItem[]` in the loop body, distribute to supermarket groups after building them (same pattern as `boughtAutoItems`).

**Component:** add `collapsedIgnoredSections = signal<Set<string>>(new Set())` and helpers:
- `toggleIgnoredSection(key: string): void`
- `isIgnoredSectionExpanded(key: string): boolean`

Clear `collapsedIgnoredSections` in `ionViewWillLeave`.

**Swipe-end icon for auto-items:** change from `trash-outline` (danger) to `eye-off-outline` (medium).

---

### 3. Buy button — isolated, primary, circular

Remove `button` attribute and global `(click)` from `ion-item`. Replace cart icon with a dedicated `ion-button`:

```html
<ion-button
  fill="solid"
  color="primary"
  shape="round"
  class="buy-btn"
  (click)="facade.markAsBought(suggestion)">
  <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
</ion-button>
```

Place in `slot="end"` of the `ion-item`.

**SCSS `.buy-btn`:**
```scss
.buy-btn {
  --padding-start: 0;
  --padding-end: 0;
  width: 36px;
  height: 36px;
  margin: 0;
}
```

---

### 4. Toast notifications

Inject `ToastController` in `ListStateService`. Private helper:

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

Called fire-and-forget (`void this.showToast(...)`) from action methods:

| Action | Toast message (i18n key) |
|---|---|
| `markAsBought` success | `shopping.toasts.bought` — "✓ {{name}} comprado. Inventario actualizado." |
| `markManualAsBought` | `shopping.toasts.boughtManual` — "✓ {{name}} comprado." |
| `removeAutoItem` | `shopping.toasts.ignored` — "{{name}} oculto por ahora — volverá la próxima vez." |
| `removeManualItem` | `shopping.toasts.removedManual` — "{{name}} eliminado de la lista." |

`restoreFromBought` and `addManualItem` → no toast (immediate visual feedback sufficient).

---

## i18n — new keys (all 6 languages)

Under `"shopping"`:

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

---

## Files changed

| File | Change |
|---|---|
| `core/models/list/list.model.ts` | Add `ignoredItems: BoughtItem[]` to `ShoppingSuggestionGroup` |
| `core/utils/list-grouping.util.ts` | Initialize `ignoredItems: []` in group objects |
| `core/services/list/list-state.service.ts` | Reorder loop, compute `ignoredAutoItems`, distribute to groups, inject `ToastController`, add `showToast`, update action methods |
| `features/list/list.component.ts` | Add `collapsedIgnoredSections` signal + helpers, clear in `ionViewWillLeave` |
| `features/list/list.component.html` | Isolated buy button, ignored section, swipe icon change |
| `features/list/list.component.scss` | `.buy-btn`, `.ignored-section`, `.ignored-section-header`, `.ignored-name` |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` | `shopping.ignored.*`, `shopping.toasts.*` |

---

## Out of scope

- Restore action for ignored items (they reappear automatically on next visit)
- Toast for `restoreFromBought` or `addManualItem`
- Persistent ignore list (ignored state is always ephemeral)
