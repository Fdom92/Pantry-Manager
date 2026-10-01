# Undo Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user undo a purchase from the shopping list's "Comprado" section, for as long
as that row is still visible this visit — restoring the pantry product to exactly how it was
before the purchase, not just hiding the row.

**Architecture:** A snapshot-based undo, not a subtractive one — buying mutates a `PantryItem`
in ways that aren't cleanly reversible by "subtracting what was added" (a new lot can get
merged into an existing batch by `mergeBatchesByExpiryStock`; a fresh item's restock replaces
the whole batch state). So `markAsBought`/`markManualAsBought` capture a full snapshot of the
item right before mutating it, store it in a new ephemeral signal (same lifecycle as the
existing `boughtItemIds`/`boughtManuals` — cleared in `ionViewWillLeave`), and `undoPurchase()`
either restores that snapshot verbatim or, for a manual item that created a brand-new product,
deletes it and returns the manual note to the pending list. A cheap staleness check (compare
the item's `updatedAt` right after the buy against its current `updatedAt`) refuses the undo if
the product was touched by something else in between, instead of silently clobbering that
other change.

**Tech Stack:** Angular 20 standalone components, signals, `@ngx-translate/core`.

Design doc: `docs/superpowers/specs/2026-10-01-undo-purchase-design.md`.

---

## Before you start

Run from the repo root (`/Users/fernandodelolmomartin/Repos/pantry-manager`), on branch
`release/5.6`. Confirm clean tree first:

```bash
git status --short
```

If anything is uncommitted that isn't yours, stop and ask — don't touch it.

**One fact this plan leans on, verified during design:** `PantryStoreService.updateItem(item)`
is safe to call with a stale/absent `_rev` — the storage layer
(`src/app/core/services/shared/storage.service.ts`'s `_upsert`) always overwrites the incoming
doc's `_rev` with whatever is currently stored before writing (`newDoc._rev = existing?._rev`),
only logging a warning if they differed. So restoring a pre-purchase snapshot via `updateItem`
needs no manual `_rev`/conflict handling — just pass the snapshot object as captured.

---

### Task 1: Snapshot capture, restore logic, and the new manual-list method

**Files:**
- Modify: `src/app/core/services/list/list-manual-items.store.ts`
- Modify: `src/app/core/services/list/list-state.service.ts`
- Modify: `src/app/core/constants/analytics/events.constants.ts`
- Test: `src/app/core/services/list/list-state.service.spec.ts`

- [ ] **Step 1: Add `restoreManual` to `ListManualItemsStore`**

In `src/app/core/services/list/list-manual-items.store.ts`, add this method right after
`markManualAsBought`:

```ts
  /**
   * Undo of markManualAsBought: puts the exact same entry (id, name, createdAt)
   * back into the pending list and drops it from boughtManuals, as if it had
   * never been bought. No analytics here — the caller (undoPurchase) tracks
   * SHOPPING_BUY_UNDONE once for the whole operation.
   */
  restoreManual(item: ManualItem): void {
    this.manualItems.update(list => [...list, item]);
    this.storage.manualList.setItems(this.manualItems());
    this.boughtManuals.update(list => list.filter(b => b.id !== item.id));
  }
```

- [ ] **Step 2: Add the undo-record model and the new ephemeral signal**

In `src/app/core/services/list/list-state.service.ts`, update the import from
`@core/models/list` to also pull in `ManualItem`:

```ts
import { type ShoppingStateWithItem, type ShoppingSuggestionWithItem, ShoppingReason, type ManualItem } from '@core/models/list';
```

Find:

```ts
  // Ephemeral per-visit state — cleared on ionViewWillLeave ("hide for now" means this visit).
  readonly boughtItemIds  = signal<Set<string>>(new Set());
  readonly removedAutoIds = signal<Set<string>>(new Set());
```

Add right after it:

```ts
  /**
   * One entry per bought row, keyed by the same id shown in the Comprado
   * section (the pantry item id for auto/manual-matched buys, the manual
   * entry's own id for a brand-new manual buy). Ephemeral per-visit, same
   * lifecycle as boughtItemIds/boughtManuals above — cleared below.
   */
  private readonly purchaseUndoRecords = signal<Map<string, PurchaseUndoRecord>>(new Map());
```

Right before the class (or right after the imports, before `@Injectable()`), add the record
type:

```ts
interface PurchaseUndoRecord {
  pantryItemId: string;
  /** Full pre-buy copy. Absent when the buy created a brand-new product — there's nothing to restore it to, only to delete. */
  pantryItemSnapshot?: PantryItem;
  /** The item's own updatedAt right after the buy — compared against its current updatedAt at undo time to detect "something else touched it since". */
  updatedAtAfterBuy: string;
  /** Present only for a manual-sourced row: what to hand back to ListManualItemsStore.restoreManual. */
  manualItem?: ManualItem;
}
```

- [ ] **Step 3: Clear the new signal alongside the existing ephemeral ones**

Find `ionViewWillLeave` (search for `boughtItemIds.set(new Set())`). Add
`this.purchaseUndoRecords.set(new Map());` right next to it, same block.

- [ ] **Step 4: Capture a snapshot in `markAsBought`**

In `markAsBought`, find the `isFresh` branch:

```ts
      if (isFresh) {
        const item = suggestion.item;
        const updatedFresh = restockFreshItem(item, timestamp, generateBatchId());
        await this.pantryStore.updateItem(updatedFresh);
        await this.eventManager.logAdvancedEdit(item, updatedFresh, 'pantry_card');
      } else {
```

Replace with:

```ts
      if (isFresh) {
        const item = suggestion.item;
        const preSnapshot = structuredClone(item);
        const updatedFresh = restockFreshItem(item, timestamp, generateBatchId());
        await this.pantryStore.updateItem(updatedFresh);
        await this.eventManager.logAdvancedEdit(item, updatedFresh, 'pantry_card');
        this.recordPurchaseUndo(id, preSnapshot, updatedFresh.updatedAt);
      } else {
```

Then find the `else` branch's body:

```ts
        const previous = suggestion.item;
        // Restocking an existing product: derive the expiry from the product's
        // own foodType when it has one, otherwise infer it from its name. Without
        // this the new lot is dateless and invisible to every expiry alert.
        const suggested = resolveSuggestedExpiry(previous.name, previous.foodType, new Date(timestamp));
        const updated = await this.pantryStore.addNewLot(id, { quantity, ...toLotExpiry(suggested) });
        if (updated) {
          await this.eventManager.logAddExistingItem(previous, updated, quantity, undefined, undefined, timestamp);
        }
      }
```

Replace with:

```ts
        const previous = suggestion.item;
        const preSnapshot = structuredClone(previous);
        // Restocking an existing product: derive the expiry from the product's
        // own foodType when it has one, otherwise infer it from its name. Without
        // this the new lot is dateless and invisible to every expiry alert.
        const suggested = resolveSuggestedExpiry(previous.name, previous.foodType, new Date(timestamp));
        const updated = await this.pantryStore.addNewLot(id, { quantity, ...toLotExpiry(suggested) });
        if (updated) {
          await this.eventManager.logAddExistingItem(previous, updated, quantity, undefined, undefined, timestamp);
          this.recordPurchaseUndo(id, preSnapshot, updated.updatedAt);
        }
      }
```

- [ ] **Step 5: Capture a snapshot (or "it's new") in `markManualAsBought`**

In `markManualAsBought`, find:

```ts
      if (match) {
        let updated: PantryItem | null;
        if (match.productType === 'fresh') {
          // Fresh products track stock as a state on a single batch, so they are
          // refilled rather than given a new lot.
          updated = restockFreshItem(match, timestamp, generateBatchId());
          await this.pantryStore.updateItem(updated);
        } else {
          // Same reasoning as markAsBought: an added lot with no date would be
          // invisible to the expiry alerts.
          const suggested = resolveSuggestedExpiry(match.name, match.foodType, new Date(timestamp));
          updated = await this.pantryStore.addNewLot(match._id, { quantity, ...toLotExpiry(suggested) });
          if (updated) await this.pantryStore.updateItem(updated);
        }
        if (updated) {
          await this.eventManager.logAddExistingItem(match, updated, quantity, undefined, undefined, timestamp);
        }
      } else {
        const base = buildAddItemPayload({
          id: createDocumentId('item'),
          nowIso: timestamp,
          name: item.name,
          quantity,
        });
        const newItem: PantryItem = { ...base, productType: 'pantry' };
        await this.pantryStore.addItem(newItem);
        await this.eventManager.logAddNewItem(newItem, quantity, undefined, timestamp);
      }
```

Replace with:

```ts
      if (match) {
        const preSnapshot = structuredClone(match);
        let updated: PantryItem | null;
        if (match.productType === 'fresh') {
          // Fresh products track stock as a state on a single batch, so they are
          // refilled rather than given a new lot.
          updated = restockFreshItem(match, timestamp, generateBatchId());
          await this.pantryStore.updateItem(updated);
        } else {
          // Same reasoning as markAsBought: an added lot with no date would be
          // invisible to the expiry alerts.
          const suggested = resolveSuggestedExpiry(match.name, match.foodType, new Date(timestamp));
          updated = await this.pantryStore.addNewLot(match._id, { quantity, ...toLotExpiry(suggested) });
          if (updated) await this.pantryStore.updateItem(updated);
        }
        if (updated) {
          await this.eventManager.logAddExistingItem(match, updated, quantity, undefined, undefined, timestamp);
          this.recordPurchaseUndo(id, preSnapshot, updated.updatedAt, item, match._id);
        }
      } else {
        const base = buildAddItemPayload({
          id: createDocumentId('item'),
          nowIso: timestamp,
          name: item.name,
          quantity,
        });
        const newItem: PantryItem = { ...base, productType: 'pantry' };
        await this.pantryStore.addItem(newItem);
        await this.eventManager.logAddNewItem(newItem, quantity, undefined, timestamp);
        this.recordPurchaseUndo(id, undefined, newItem.updatedAt, item, newItem._id);
      }
```

Note the 4th/5th args: `recordPurchaseUndo` is keyed by the BOUGHT ROW's id (`id`, the manual
entry's own id — same id `boughtManuals` already uses), but the snapshot/undo target is the
PANTRY item, which has a different id (`match._id` or `newItem._id`). That's why the helper
below takes both separately.

- [ ] **Step 6: Add `recordPurchaseUndo`, `undoPurchase`, and the private restore helpers**

Add these methods right after `markManualAsBought`:

```ts
  private recordPurchaseUndo(
    boughtRowId: string,
    pantryItemSnapshot: PantryItem | undefined,
    updatedAtAfterBuy: string,
    manualItem?: ManualItem,
    pantryItemId?: string,
  ): void {
    this.purchaseUndoRecords.update(map => {
      const next = new Map(map);
      next.set(boughtRowId, {
        pantryItemId: pantryItemId ?? boughtRowId,
        pantryItemSnapshot,
        updatedAtAfterBuy,
        manualItem,
      });
      return next;
    });
  }

  /**
   * Reverts a purchase: restores the pre-buy snapshot (or deletes a
   * brand-new product), and hands a manual entry back to the pending list
   * if the purchase came from one. Refuses — with a toast, no state change —
   * if the product was touched by something else since the buy, so undo
   * never silently clobbers an unrelated edit.
   */
  async undoPurchase(boughtRowId: string): Promise<void> {
    const record = this.purchaseUndoRecords().get(boughtRowId);
    if (!record) return;

    const current = this.items().find(i => i._id === record.pantryItemId);
    if (current && current.updatedAt !== record.updatedAtAfterBuy) {
      this.toast.error('shopping.toasts.undoStale');
      return;
    }

    try {
      if (record.pantryItemSnapshot) {
        await this.pantryStore.updateItem(record.pantryItemSnapshot);
      } else if (current) {
        await this.pantryStore.deleteItem(record.pantryItemId);
      }
      if (record.manualItem) {
        this.manualItemsStore.restoreManual(record.manualItem);
      }
      this.purchaseUndoRecords.update(map => {
        const next = new Map(map);
        next.delete(boughtRowId);
        return next;
      });
      this.boughtItemIds.update(set => {
        const next = new Set(set);
        next.delete(record.pantryItemId);
        return next;
      });
      this.toast.success('shopping.toasts.purchaseUndone');
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BUY_UNDONE, {
        kind: record.pantryItemSnapshot ? 'restock' : 'created',
      });
    } catch (err) {
      this.logger.error('ListStateService', 'undoPurchase failed', err);
      this.toast.error('shopping.toasts.undoFailed');
    }
  }
```

(`boughtItemIds` only ever gains ids for the auto-suggestion path — `markManualAsBought` never
adds to it, it uses `boughtManuals` instead — so deleting from it here is a no-op for manual
rows and correct for auto rows; harmless either way since `Set.delete` on a missing key is a
no-op.)

- [ ] **Step 7: Add the analytics event**

In `src/app/core/constants/analytics/events.constants.ts`, find
`SHOPPING_BUY_COMPLETED: 'shopping_buy_completed',` and add right after it:

```ts
  SHOPPING_BUY_COMPLETED: 'shopping_buy_completed',
  SHOPPING_BUY_UNDONE: 'shopping_buy_undone',
```

- [ ] **Step 8: Write the tests**

Add a new `describe('undoPurchase', ...)` block to
`src/app/core/services/list/list-state.service.spec.ts` (read the existing file first for its
`TestBed` provider setup and `pollo()`/spy patterns — match them exactly, don't invent a new
mocking style). Cover:

```ts
describe('undoPurchase', () => {
  it('restores the item to its pre-purchase snapshot after an auto-restock', async () => {
    // Seed a below-threshold item, call markAsBought via its suggestion,
    // then call undoPurchase with the same id the bought row would carry
    // (the pantry item's own _id for an auto buy) and assert
    // pantryStoreSpy.updateItem was called with a payload whose batches
    // match the pre-buy state, not the post-buy one.
  });

  it('refuses to undo and shows a toast when the item changed since the purchase', async () => {
    // After markAsBought, mutate the item in the fake loadedProducts/items
    // signal to simulate an edit elsewhere (different updatedAt), then call
    // undoPurchase and assert pantryStoreSpy.updateItem was NOT called again
    // and toastSpy.error was called with 'shopping.toasts.undoStale'.
  });

  it('deletes the newly-created product and restores the manual entry when undoing a manual buy that created a new product', async () => {
    // Call markManualAsBought for a manual entry with no matching pantry
    // item, then undoPurchase with the manual entry's id, and assert
    // pantryStoreSpy.deleteItem was called with the new product's id and
    // manualItemsStore.restoreManual (or the resulting manualItems signal)
    // has the entry back.
  });
});
```

Write the actual test bodies yourself against the real method signatures and the existing
file's exact mocking conventions — the three bullet points above describe the required
behavior, not literal code to paste.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/list-state.service.spec.ts'`
Expected: PASS, all tests green (existing tests in this file plus your 3 new ones).

- [ ] **Step 10: Run the full suite and build**

```bash
npx ng lint
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Nothing in the template calls `undoPurchase` yet — that's Task 2. Build/tests must stay green.

- [ ] **Step 11: Commit**

```bash
git add src/app/core/services/list/list-manual-items.store.ts src/app/core/services/list/list-state.service.ts src/app/core/services/list/list-state.service.spec.ts src/app/core/constants/analytics/events.constants.ts
git commit -m "feat(shopping): snapshot-based undo for a purchase

markAsBought/markManualAsBought now capture a full pre-purchase copy
of the pantry item before mutating it (buying isn't cleanly
subtractive — a new lot can get merged into an existing batch by
mergeBatchesByExpiryStock, a fresh restock replaces the whole batch
state). undoPurchase() restores that snapshot, or deletes the
product and returns the manual note to the pending list if the
purchase had created it from scratch. Refuses with a toast if the
product was touched by something else since the buy (compares
updatedAt), instead of silently overwriting that other change. Not
wired into the template yet."
```

---

### Task 2: Undo button, toasts, stale comment cleanup

**Files:**
- Modify: `src/app/features/list/list.component.html`
- Modify: `src/app/features/list/list.component.scss`
- Modify: `src/app/core/domain/list/list-row-actions.domain.ts`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Add the undo button to each bought row**

In `src/app/features/list/list.component.html`, find:

```html
        <!-- Global "Comprado" section -->
        @if (state.allBoughtItems.length) {
          <div class="suggestion-group">
            <button class="bought-section-header pressable" (click)="toggleGlobalBought()">
              <ion-icon name="checkmark-circle-outline" color="success"></ion-icon>
              <span>{{ 'shopping.bought.sectionTitle' | translate }}</span>
              <ion-badge class="group-count group-count--success">{{ state.allBoughtItems.length }}</ion-badge>
              <ion-icon
                class="collapse-icon"
                [name]="globalBoughtExpanded() ? 'chevron-down-outline' : 'chevron-up-outline'">
              </ion-icon>
            </button>
            @if (globalBoughtExpanded()) {
              <ion-list class="item-list bought-list" lines="none">
                @for (bought of state.allBoughtItems; track bought.id) {
                  <ion-item class="bought-item" detail="false">
                    <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
                    <span class="item-name bought-name">{{ bought.name }}</span>
                  </ion-item>
                }
              </ion-list>
            }
          </div>
        }
```

Replace the inner `<ion-item>` with:

```html
                  <ion-item class="bought-item" detail="false">
                    <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
                    <span class="item-name bought-name">{{ bought.name }}</span>
                    <ion-button
                      slot="end"
                      fill="clear"
                      color="medium"
                      class="undo-btn"
                      (click)="facade.undoPurchase(bought.id)"
                      [attr.aria-label]="'common.actions.undo' | translate">
                      <ion-icon slot="icon-only" name="arrow-undo-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
```

(`arrow-undo-outline` is already registered in `src/app/app-icons.ts` — no change needed
there.)

- [ ] **Step 2: Add `.undo-btn` sizing**

In `src/app/features/list/list.component.scss`, find the `.buy-btn` rule:

```scss
.buy-btn {
  --padding-start: 0;
  --padding-end: 0;
  width: 36px;
  height: 36px;
  margin: 0;
  flex-shrink: 0;
}
```

Add right after it:

```scss

.undo-btn {
  --padding-start: 0;
  --padding-end: 0;
  width: 36px;
  height: 36px;
  margin: 0;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Fix the stale comment that said undo wasn't implemented**

In `src/app/core/domain/list/list-row-actions.domain.ts`, replace:

```ts
/**
 * The shopping list has one interaction rule: a row's button is its primary
 * action (buy), tapping the row opens a menu with the rest. This table is the
 * only place that decides what that menu holds. It replaced three swipe
 * gestures in two directions and a hidden section with no way back.
 *
 * Bought rows are read-only: undoing a purchase (reverting the restock) is
 * not implemented.
 */
```

with:

```ts
/**
 * The shopping list has one interaction rule: a row's button is its primary
 * action (buy), tapping the row opens a menu with the rest. This table is the
 * only place that decides what that menu holds. It replaced three swipe
 * gestures in two directions and a hidden section with no way back.
 *
 * Bought rows aren't part of this menu system — undoing a purchase is a
 * dedicated button on the row itself (ListStateService.undoPurchase), not a
 * tap-to-open-menu action, so there's no 'bought' ListRowKind here.
 */
```

- [ ] **Step 4: Add the new i18n keys, all 6 bundles**

Add two keys under the existing `shopping.toasts` object in
`src/assets/i18n/{es,en,de,fr,it,pt}.json` (anywhere inside `toasts`, e.g. right after
`"shareFailed"`):

`es.json`:
```json
"purchaseUndone": "Compra deshecha.",
"undoStale": "Ya no se puede deshacer — el producto cambió después de comprarlo.",
"undoFailed": "No se ha podido deshacer la compra. Inténtalo de nuevo."
```

English (`en.json`): `"purchaseUndone": "Purchase undone."`, `"undoStale": "Can't undo anymore — the product changed after you bought it."`, `"undoFailed": "Couldn't undo the purchase. Try again."`.
German (`de.json`): `"purchaseUndone": "Kauf rückgängig gemacht."`, `"undoStale": "Kann nicht mehr rückgängig gemacht werden — das Produkt wurde nach dem Kauf geändert."`, `"undoFailed": "Der Kauf konnte nicht rückgängig gemacht werden. Versuche es erneut."`.
French (`fr.json`): `"purchaseUndone": "Achat annulé."`, `"undoStale": "Impossible d'annuler — le produit a changé après l'achat."`, `"undoFailed": "Impossible d'annuler l'achat. Réessaie."`.
Italian (`it.json`): `"purchaseUndone": "Acquisto annullato."`, `"undoStale": "Non è più possibile annullare — il prodotto è cambiato dopo l'acquisto."`, `"undoFailed": "Impossibile annullare l'acquisto. Riprova."`.
Portuguese (`pt.json`): `"purchaseUndone": "Compra desfeita."`, `"undoStale": "Já não é possível desfazer — o produto mudou depois da compra."`, `"undoFailed": "Não foi possível desfazer a compra. Tenta novamente."`.

`common.actions.undo` already exists in all 6 bundles ("Deshacer"/"Undo"/...) and is reused
as-is for the button's aria-label — no change needed there.

- [ ] **Step 5: Verify**

```bash
npx ng lint
node scripts/check-icons.mjs
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

- [ ] **Step 6: Verify in the browser**

Start the dev server. Use the
`ng.getComponent(document.querySelector('app-root')).pantryStore` console trick to seed a
despensa item below its threshold (so it appears as a suggestion), buy it, confirm it moves to
"Comprado", tap the new undo icon, confirm: the row disappears from "Comprado", the product's
stock is back to what it was before buying (check in Despensa), and a "Compra deshecha" toast
shows. Then test the stale-guard: buy an item, edit that SAME item from Despensa (change its
quantity) without leaving the shopping list tab (open Despensa in a new browser tab/window
pointing at the same dev server instance, or use the console to call
`pantryStore.updateItem(...)` directly on that item to simulate the edit), come back to the
list tab, tap undo on that row, and confirm it shows the "ya no se puede deshacer" toast
instead of silently overwriting the edit. Also test a manual item that creates a brand-new
product: add a manual note for something not in your pantry, buy it, confirm a new product
appears in Despensa, tap undo, confirm the product is gone from Despensa and the note is back
in the shopping list's input area unmarked.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/list/list.component.html src/app/features/list/list.component.scss src/app/core/domain/list/list-row-actions.domain.ts src/assets/i18n/
git commit -m "feat(shopping): undo button on bought rows

Wires ListStateService.undoPurchase into the Comprado section — a
small icon button per row, same visual weight as the buy button on
suggestions. Also fixes list-row-actions.domain.ts's header comment,
which said undo wasn't implemented."
```

---

### Task 3: Manual device QA note

No code changes — this task is a checklist, not a commit.

- [ ] Build a debug APK (`npm run prepare:build`, then run from Android Studio).
- [ ] Buy a real product from the list, undo it, confirm the pantry row looks exactly as it
  did before (same quantity, same expiry) — not just "some quantity restored."
- [ ] Buy a fresh product (the ones that skip the quantity sheet and snap to "sufficiente"),
  undo it, confirm it's back to whatever state it was in before (empty/low/sufficient).
- [ ] Switch tabs (Despensa ↔ Compra) after buying something, without tapping undo, and
  confirm the bought row is gone when you come back to Compra — the per-visit window actually
  behaves as designed on-device, not just in the browser dev server.
- [ ] Confirm the undo icon doesn't crowd the row on a narrow phone screen next to the
  line-through product name.

---

## Self-Review Notes (already applied above, kept for the reviewer)

- **Spec coverage:** snapshot-not-subtraction (Task 1 Steps 4-6), staleness guard comparing
  `updatedAt` (Task 1 Step 6's `undoPurchase`), the 4 cases from the design doc's table (auto
  fresh/normal use the snapshot-restore path; manual-matched reuses the same path keyed by the
  matched product's id; manual-created uses the delete+restore-manual path — all three are one
  `recordPurchaseUndo`/`undoPurchase` pair, not three separate implementations), ephemeral
  per-visit scope (Task 1 Step 3 clears the new signal in the same place the existing ones
  already are), undo button UI (Task 2 Step 1), analytics event (Task 1 Step 7).
- **Known, accepted gap not in the design doc's "Qué NO cambia" list:** undoing does not revert
  the `HistoryEventManagerService` log entry written at buy time (`logAddExistingItem`/
  `logAdvancedEdit`/`logAddNewItem`) — the history log will still show "added a lot"/"restocked"
  even after an undo. Reversing history log entries would need a delete capability that may not
  exist and adds real complexity for what's primarily an audit trail, not user-facing state.
  Flagging explicitly here since the design doc didn't call it out.
- **Type consistency:** `PurchaseUndoRecord` (new, Task 1) and the existing `ManualItem`/
  `PantryItem` types it embeds are used identically in `recordPurchaseUndo` and `undoPurchase`
  — no mismatch between what's stored and what's read back.
- **Dead code:** none created. `restoreManual` (Task 1 Step 1) is new, used once (Task 1 Step
  6), not dead.
