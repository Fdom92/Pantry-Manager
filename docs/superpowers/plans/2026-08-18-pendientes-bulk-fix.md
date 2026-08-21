# Pendientes Bulk-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user bulk-fix pantry items missing `foodType` and/or a batch `expirationDate` ("pendientes") from a single sheet, instead of opening the full edit modal per item.

**Architecture:** Two new pure domain functions (`suggestExpiryDate`, `applyPendienteFix`) plus a small refactor of the existing `isIncomplete` predicate, a new page-scoped Angular signal-based state service (`PantryPendientesSheetStateService`) that builds an editable row per incomplete item, and a new self-contained sheet component that injects that state service directly (same pattern as `PantryReceiptScanModalComponent`, the most recently shipped modal in this codebase). Both existing entry points (the `pendientes` filter chip in Despensa, and the CTA in Insights) are wired to open the new sheet instead of only filtering the list.

**Tech Stack:** Angular 20 (standalone components, signals), Ionic 8 (`ion-modal` sheet pattern), no new dependencies.

**Test convention note:** This codebase writes Jasmine specs (Karma, no TestBed) for the pure `core/domain/**` layer only — verified zero `.spec.ts` files exist for any `core/services/pantry/modals/*` state service today, despite that directory's own README documenting a TestBed pattern that was never actually applied. This plan follows the **real** convention: TDD (red/green) for the two new/changed domain functions, direct implementation + manual dev-server verification for the Angular service/component layer.

Spec: [`docs/superpowers/specs/2026-08-18-pendientes-bulk-fix-design.md`](../specs/2026-08-18-pendientes-bulk-fix-design.md)

---

### Task 1: Domain — extract `hasMissingExpiry`, add test coverage for `isIncomplete`

**Files:**
- Modify: `src/app/core/domain/pantry/pantry-filtering.domain.ts:35-45`
- Modify: `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts`

`isIncomplete()` is the exact predicate the whole bulk-fix sheet is built on, and it currently has zero dedicated tests. The sheet also needs to know *which* dimension (foodType vs. date) is missing per item, so the batch-check half of `isIncomplete` needs to be its own exported function.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts` (after the existing `describe('matchesFilters — review filter', ...)` block, i.e. after line 68):

```ts
describe('isIncomplete', () => {
  it('is incomplete when foodType is missing, even with a full expirationDate', () => {
    const item = makeItem({
      foodType: undefined,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) }],
    });
    expect(isIncomplete(item)).toBeTrue();
  });

  it('is complete when foodType is set and every batch has a date', () => {
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });

  it('is incomplete when foodType is set but a batch is missing a date and not noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.CARB,
      batches: [
        { batchId: 'b1', quantity: 1, expirationDate: daysFromNow(30) },
        { batchId: 'b2', quantity: 1 },
      ],
    });
    expect(isIncomplete(item)).toBeTrue();
  });

  it('is complete when the only dateless batch is explicitly marked noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });

  it('fresh items with foodType set are always complete, regardless of batches', () => {
    const item = makeItem({
      foodType: FoodType.VEGETABLE,
      productType: 'fresh',
      batches: [{ batchId: 'b1', quantity: 1 }],
    });
    expect(isIncomplete(item)).toBeFalse();
  });
});

describe('hasMissingExpiry', () => {
  it('is false for fresh items regardless of batch dates', () => {
    const item = makeItem({ productType: 'fresh', batches: [{ batchId: 'b1', quantity: 1 }] });
    expect(hasMissingExpiry(item)).toBeFalse();
  });

  it('is true when any pantry batch lacks a date and is not noExpiry', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1 }] });
    expect(hasMissingExpiry(item)).toBeTrue();
  });

  it('is false when every dateless batch is marked noExpiry', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1, noExpiry: true }] });
    expect(hasMissingExpiry(item)).toBeFalse();
  });
});
```

Update the top import (line 2) to pull in the two new names:

```ts
import { hasMissingExpiry, isIncomplete, matchesFilters } from './pantry-filtering.domain';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include='src/app/core/domain/pantry/pantry-filtering.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `hasMissingExpiry is not a function` / `isIncomplete is not exported` (it IS exported already, so only the `hasMissingExpiry` import fails at compile time — TypeScript compile error is the expected failure here).

- [ ] **Step 3: Extract `hasMissingExpiry` and simplify `isIncomplete`**

Replace `src/app/core/domain/pantry/pantry-filtering.domain.ts:35-45`:

```ts
/**
 * Check if any of the item's batches is missing an expiration date and isn't
 * explicitly marked noExpiry. Fresh items never count (no batch-level dates).
 */
export function hasMissingExpiry(item: PantryItem): boolean {
  if (item.productType === 'fresh') return false;
  const batches = item.batches ?? [];
  return batches.some(b => !b.expirationDate && !b.noExpiry);
}

/**
 * Check if item is missing relevant tracking data (no foodType or any batch without expiry).
 */
export function isIncomplete(item: PantryItem): boolean {
  if (!item.foodType) return true;
  return hasMissingExpiry(item);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include='src/app/core/domain/pantry/pantry-filtering.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — all `isIncomplete`, `hasMissingExpiry`, and pre-existing `matchesFilters — review filter` specs green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/pantry-filtering.domain.ts src/app/core/domain/pantry/pantry-filtering.domain.spec.ts
git commit -m "refactor(pantry): extract hasMissingExpiry from isIncomplete, add test coverage"
```

---

### Task 2: Domain — `expiry-suggestion.domain.ts`

**Files:**
- Create: `src/app/core/domain/pantry/expiry-suggestion.domain.ts`
- Test: `src/app/core/domain/pantry/expiry-suggestion.domain.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/domain/pantry/expiry-suggestion.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { EXPIRY_SUGGESTION_DAYS, suggestExpiryDate } from './expiry-suggestion.domain';

describe('suggestExpiryDate', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('adds the configured number of days for the given foodType', () => {
    expect(suggestExpiryDate(FoodType.DAIRY, from)).toBe('2026-01-15');
  });

  it('matches EXPIRY_SUGGESTION_DAYS for every FoodType value', () => {
    for (const type of Object.values(FoodType)) {
      const days = EXPIRY_SUGGESTION_DAYS[type];
      const expected = new Date(from);
      expected.setDate(expected.getDate() + days);
      const y = expected.getFullYear();
      const m = String(expected.getMonth() + 1).padStart(2, '0');
      const d = String(expected.getDate()).padStart(2, '0');
      expect(suggestExpiryDate(type, from)).toBe(`${y}-${m}-${d}`);
    }
  });

  it('does not mutate the fromDate argument', () => {
    const original = new Date('2026-06-01T00:00:00');
    const copy = new Date(original);
    suggestExpiryDate(FoodType.PROTEIN, original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/core/domain/pantry/expiry-suggestion.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — module `./expiry-suggestion.domain` not found.

- [ ] **Step 3: Implement**

Create `src/app/core/domain/pantry/expiry-suggestion.domain.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';

/**
 * Estimated shelf life in days per FoodType, used to pre-fill a suggested
 * expiry date in the pendientes bulk-fix sheet once the user picks a type.
 * Orientative values — tune independently of the rest of this module.
 */
export const EXPIRY_SUGGESTION_DAYS: Record<FoodType, number> = {
  [FoodType.PROTEIN]: 5,
  [FoodType.CARB]: 270,
  [FoodType.VEGETABLE]: 7,
  [FoodType.FRUIT]: 7,
  [FoodType.DAIRY]: 14,
  [FoodType.HOUSEHOLD]: 365,
  [FoodType.OTHER]: 120,
};

/**
 * Suggests a `YYYY-MM-DD` expiry date by adding the foodType's estimated
 * shelf life to fromDate (defaults to now).
 */
export function suggestExpiryDate(foodType: FoodType, fromDate: Date = new Date()): string {
  const days = EXPIRY_SUGGESTION_DAYS[foodType];
  const result = new Date(fromDate);
  result.setDate(result.getDate() + days);
  return toLocalYmd(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/core/domain/pantry/expiry-suggestion.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — all 3 specs green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/expiry-suggestion.domain.ts src/app/core/domain/pantry/expiry-suggestion.domain.spec.ts
git commit -m "feat(pantry): add suggestExpiryDate domain helper"
```

---

### Task 3: Domain — `pendiente-fix.domain.ts`

**Files:**
- Create: `src/app/core/domain/pantry/pendiente-fix.domain.ts`
- Test: `src/app/core/domain/pantry/pendiente-fix.domain.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/domain/pantry/pendiente-fix.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { applyPendienteFix } from './pendiente-fix.domain';

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

describe('applyPendienteFix', () => {
  it('sets foodType and leaves batches untouched when no date fix is given', () => {
    const item = makeItem({
      batches: [{ batchId: 'b1', quantity: 1, expirationDate: '2026-02-01' }],
    });
    const result = applyPendienteFix(item, { foodType: FoodType.CARB });
    expect(result.foodType).toBe(FoodType.CARB);
    expect(result.batches).toEqual(item.batches);
  });

  it('applies the date only to batches missing a date and not noExpiry', () => {
    const item = makeItem({
      foodType: FoodType.DAIRY,
      batches: [
        { batchId: 'b1', quantity: 1 },
        { batchId: 'b2', quantity: 1, expirationDate: '2026-02-01' },
        { batchId: 'b3', quantity: 1, noExpiry: true },
      ],
    });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result.batches[0].expirationDate).toBe('2026-03-15');
    expect(result.batches[1].expirationDate).toBe('2026-02-01');
    expect(result.batches[2].expirationDate).toBeUndefined();
    expect(result.batches[2].noExpiry).toBe(true);
  });

  it('applies noExpiry to dateless batches and clears any stale expirationDate', () => {
    const item = makeItem({
      foodType: FoodType.HOUSEHOLD,
      batches: [{ batchId: 'b1', quantity: 1 }],
    });
    const result = applyPendienteFix(item, { noExpiry: true });
    expect(result.batches[0].noExpiry).toBe(true);
    expect(result.batches[0].expirationDate).toBeUndefined();
  });

  it('keeps the existing foodType when no foodType fix is given', () => {
    const item = makeItem({ foodType: FoodType.FRUIT, batches: [] });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result.foodType).toBe(FoodType.FRUIT);
  });

  it('returns a new item object rather than mutating the input', () => {
    const item = makeItem({ batches: [{ batchId: 'b1', quantity: 1 }] });
    const result = applyPendienteFix(item, { expirationDate: '2026-03-15' });
    expect(result).not.toBe(item);
    expect(item.batches[0].expirationDate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/core/domain/pantry/pendiente-fix.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — module `./pendiente-fix.domain` not found.

- [ ] **Step 3: Implement**

Create `src/app/core/domain/pantry/pendiente-fix.domain.ts`:

```ts
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import type { FoodType } from '@core/models/shared/enums.model';

export interface PendienteFix {
  foodType?: FoodType;
  expirationDate?: string;
  noExpiry?: boolean;
}

/**
 * Applies a pendientes bulk-fix row's edits to a PantryItem:
 * - foodType (if provided) replaces the item's foodType.
 * - expirationDate/noExpiry (if either provided) is applied to every batch
 *   that is currently missing a date and not already marked noExpiry —
 *   batches that already have a date, or are already noExpiry, are left as-is.
 */
export function applyPendienteFix(item: PantryItem, fix: PendienteFix): PantryItem {
  const shouldUpdateBatches = fix.expirationDate !== undefined || fix.noExpiry !== undefined;

  const batches: ItemBatch[] = shouldUpdateBatches
    ? item.batches.map(batch =>
        !batch.expirationDate && !batch.noExpiry
          ? { ...batch, expirationDate: fix.expirationDate, noExpiry: fix.noExpiry || undefined }
          : batch
      )
    : item.batches;

  return {
    ...item,
    foodType: fix.foodType ?? item.foodType,
    batches,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='src/app/core/domain/pantry/pendiente-fix.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — all 5 specs green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/pendiente-fix.domain.ts src/app/core/domain/pantry/pendiente-fix.domain.spec.ts
git commit -m "feat(pantry): add applyPendienteFix domain helper"
```

---

### Task 4: Event source + analytics event constants

**Files:**
- Modify: `src/app/core/models/events/event.model.ts:6-14`
- Modify: `src/app/core/constants/analytics/events.constants.ts:45-50`

- [ ] **Step 1: Add the new `EventSource` value**

Replace `src/app/core/models/events/event.model.ts:6-14`:

```ts
export type EventSource =
  | 'add_modal'
  | 'consume_modal'
  | 'quantity_sheet'
  | 'batches_modal'
  | 'edit_modal'
  | 'pantry_card'
  | 'dashboard'
  | 'pendientes_bulk_fix'
  | 'system';
```

- [ ] **Step 2: Add the two new analytics events**

Replace `src/app/core/constants/analytics/events.constants.ts:45-50`:

```ts
  // Pantry modal opens — enable abandonment funnels (opened vs submitted).
  PANTRY_ADD_MODAL_OPENED: 'pantry_add_modal_opened',
  PANTRY_FRESH_ADD_MODAL_OPENED: 'pantry_fresh_add_modal_opened',
  PANTRY_CONSUME_MODAL_OPENED: 'pantry_consume_modal_opened',
  PANTRY_EDIT_MODAL_OPENED: 'pantry_edit_modal_opened',
  PANTRY_BATCHES_MODAL_OPENED: 'pantry_batches_modal_opened',
  PANTRY_PENDIENTES_SHEET_OPENED: 'pantry_pendientes_sheet_opened',
  PANTRY_PENDIENTES_SAVED: 'pantry_pendientes_saved',
```

- [ ] **Step 3: Verify the project still compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no new errors (these are additive union/object changes with no existing consumers yet).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/events/event.model.ts src/app/core/constants/analytics/events.constants.ts
git commit -m "feat(pantry): add pendientes_bulk_fix event source and analytics events"
```

---

### Task 5: i18n — `pantry.pendientesSheet.*` in all 6 locales

**Files:**
- Modify: `src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`

Every locale file has the identical structure at this point in the `pantry` namespace: the `quantitySheet` block closes, then `toasts` opens, both at 4-space indent (`"toasts": {` at line 746 in every file). Insert a new `pendientesSheet` sibling block right before it.

- [ ] **Step 1: es.json**

Find (line 745-746):
```json
    },
    "toasts": {
```

Replace with:
```json
    },
    "pendientesSheet": {
      "title": "Completar pendientes",
      "subtitle": "Rellena tipo de alimento y fecha de caducidad para estos productos",
      "empty": "No tienes productos pendientes",
      "dateLabel": "Añadir fecha",
      "saveAll": "Guardar todo",
      "savedToast": "{{ count }} producto(s) actualizado(s)"
    },
    "toasts": {
```

- [ ] **Step 2: en.json**

Same find/replace, English copy:
```json
    },
    "pendientesSheet": {
      "title": "Complete pending items",
      "subtitle": "Fill in food type and expiry date for these products",
      "empty": "No pending products",
      "dateLabel": "Add date",
      "saveAll": "Save all",
      "savedToast": "{{ count }} product(s) updated"
    },
    "toasts": {
```

- [ ] **Step 3: de.json**

```json
    },
    "pendientesSheet": {
      "title": "Offene Einträge vervollständigen",
      "subtitle": "Lebensmitteltyp und Ablaufdatum für diese Produkte ausfüllen",
      "empty": "Keine offenen Produkte",
      "dateLabel": "Datum hinzufügen",
      "saveAll": "Alles speichern",
      "savedToast": "{{ count }} Produkt(e) aktualisiert"
    },
    "toasts": {
```

- [ ] **Step 4: fr.json**

```json
    },
    "pendientesSheet": {
      "title": "Compléter les produits en attente",
      "subtitle": "Renseignez le type d'aliment et la date de péremption de ces produits",
      "empty": "Aucun produit en attente",
      "dateLabel": "Ajouter une date",
      "saveAll": "Tout enregistrer",
      "savedToast": "{{ count }} produit(s) mis à jour"
    },
    "toasts": {
```

- [ ] **Step 5: it.json**

```json
    },
    "pendientesSheet": {
      "title": "Completa i prodotti in sospeso",
      "subtitle": "Inserisci tipo di alimento e data di scadenza per questi prodotti",
      "empty": "Nessun prodotto in sospeso",
      "dateLabel": "Aggiungi data",
      "saveAll": "Salva tutto",
      "savedToast": "{{ count }} prodotto/i aggiornato/i"
    },
    "toasts": {
```

- [ ] **Step 6: pt.json**

```json
    },
    "pendientesSheet": {
      "title": "Completar produtos pendentes",
      "subtitle": "Preencha o tipo de alimento e a data de validade destes produtos",
      "empty": "Nenhum produto pendente",
      "dateLabel": "Adicionar data",
      "saveAll": "Guardar tudo",
      "savedToast": "{{ count }} produto(s) atualizado(s)"
    },
    "toasts": {
```

- [ ] **Step 7: Validate JSON syntax on all 6 files**

Run: `for f in es en de fr it pt; do node -e "JSON.parse(require('fs').readFileSync('src/assets/i18n/'+process.argv[1]+'.json','utf8'))" "$f" && echo "$f OK"; done`
Expected: `es OK`, `en OK`, `de OK`, `fr OK`, `it OK`, `pt OK` — no `SyntaxError`.

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/es.json src/assets/i18n/en.json src/assets/i18n/de.json src/assets/i18n/fr.json src/assets/i18n/it.json src/assets/i18n/pt.json
git commit -m "i18n: add pantry.pendientesSheet keys (6 locales)"
```

---

### Task 6: State service — `PantryPendientesSheetStateService`

**Files:**
- Create: `src/app/core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts`

Page-scoped (no `providedIn: 'root'`), following the exact conventions of the sibling modal services in this directory (guard clauses, `withSignalFlag` for the async save, direct injection of the root-scoped `PantryStoreService`/`HistoryEventManagerService`/`AnalyticsService` — same pattern as `PantryQuantitySheetStateService` and `PantryAddModalStateService`).

- [ ] **Step 1: Implement**

Create `src/app/core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts`:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { hasMissingExpiry, isIncomplete } from '@core/domain/pantry/pantry-filtering.domain';
import { applyPendienteFix } from '@core/domain/pantry/pendiente-fix.domain';
import { suggestExpiryDate } from '@core/domain/pantry/expiry-suggestion.domain';
import type { PantryItem } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { withSignalFlag } from '@core/utils';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from '../../analytics/analytics.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { PantryStoreService } from '../pantry-store.service';

export interface PendienteRow {
  itemId: string;
  name: string;
  needsFoodType: boolean;
  needsDate: boolean;
  foodType: FoodType | null;
  expirationDate: string | undefined;
  noExpiry: boolean;
  touched: boolean;
}

/**
 * Manages the "Completar pendientes" bulk-fix sheet: builds one editable row
 * per PantryItem missing foodType and/or a batch expirationDate, then applies
 * only the rows the user actually touched on save.
 */
@Injectable()
export class PantryPendientesSheetStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly analytics = inject(AnalyticsService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly rows = signal<PendienteRow[]>([]);

  readonly hasTouchedRows = computed(() => this.rows().some(row => row.touched));

  /**
   * Open the sheet and snapshot every currently-incomplete item into a row.
   */
  open(): void {
    const items = this.pantryStore.loadedProducts().filter(isIncomplete);
    this.rows.set(items.map(item => this.buildRow(item)));
    this.isOpen.set(true);
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_PENDIENTES_SHEET_OPENED, { count: items.length });
  }

  /**
   * Close with full cleanup (used after save, or explicit close button).
   */
  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.rows.set([]);
  }

  /**
   * Dismiss only (backdrop/swipe) — no state reset, so re-opening via didDismiss is a no-op.
   */
  dismiss(): void {
    this.isOpen.set(false);
  }

  /**
   * Pick a foodType for a row. If the row also needs a date and none has been
   * set yet, pre-fill the suggested date for that foodType.
   */
  selectFoodType(itemId: string, foodType: FoodType): void {
    this.rows.update(current => current.map(row => {
      if (row.itemId !== itemId) {
        return row;
      }
      const shouldSuggestDate = row.needsDate && !row.expirationDate && !row.noExpiry;
      return {
        ...row,
        foodType,
        expirationDate: shouldSuggestDate ? suggestExpiryDate(foodType) : row.expirationDate,
        touched: true,
      };
    }));
  }

  /**
   * Set (or clear) the pending expiry date for a row. Clears noExpiry when a real date is set.
   */
  setExpirationDate(itemId: string, date: string | undefined): void {
    this.rows.update(current => current.map(row =>
      row.itemId === itemId
        ? { ...row, expirationDate: date || undefined, noExpiry: date ? false : row.noExpiry, touched: true }
        : row
    ));
  }

  /**
   * Toggle "intentionally no expiry" for a row. Clears any pending date.
   */
  toggleNoExpiry(itemId: string): void {
    this.rows.update(current => current.map(row => {
      if (row.itemId !== itemId) {
        return row;
      }
      const toggled = !row.noExpiry;
      return { ...row, noExpiry: toggled, expirationDate: toggled ? undefined : row.expirationDate, touched: true };
    }));
  }

  /**
   * Persist every touched row in one pass. Untouched rows are left as-is —
   * they remain "pendientes" and will reappear next time the sheet opens.
   */
  async saveAll(): Promise<void> {
    if (this.isSaving()) {
      return;
    }
    const touchedRows = this.rows().filter(row => row.touched);
    if (!touchedRows.length) {
      this.close();
      return;
    }

    await withSignalFlag(this.isSaving, async () => {
      const items = this.pantryStore.loadedProducts();
      for (const row of touchedRows) {
        const item = items.find(candidate => candidate._id === row.itemId);
        if (!item) {
          continue;
        }

        const foodTypeFix = row.foodType && row.foodType !== item.foodType ? row.foodType : undefined;
        const dateFix = row.needsDate && (row.expirationDate || row.noExpiry)
          ? { expirationDate: row.expirationDate, noExpiry: row.noExpiry }
          : undefined;
        if (!foodTypeFix && !dateFix) {
          continue;
        }

        const updated = applyPendienteFix(item, {
          foodType: foodTypeFix,
          expirationDate: dateFix?.expirationDate,
          noExpiry: dateFix?.noExpiry,
        });
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAdvancedEdit(item, updated, 'pendientes_bulk_fix');
      }

      this.analytics.track(ANALYTICS_EVENTS.PANTRY_PENDIENTES_SAVED, { count: touchedRows.length });
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('pantry.pendientesSheet.savedToast', { count: touchedRows.length }),
        duration: 1500,
        position: 'bottom',
      });
      void toast.present();
      this.close();
    }).catch(err => {
      console.error('[PantryPendientesSheetStateService] saveAll error', err);
    });
  }

  private buildRow(item: PantryItem): PendienteRow {
    return {
      itemId: item._id,
      name: item.name,
      needsFoodType: !item.foodType,
      needsDate: hasMissingExpiry(item),
      foodType: item.foodType ?? null,
      expirationDate: undefined,
      noExpiry: false,
      touched: false,
    };
  }
}
```

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors from this new file (unused-until-wired-in is fine — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts
git commit -m "feat(pantry): add PantryPendientesSheetStateService"
```

---

### Task 7: Component — `PantryPendientesSheetComponent`

**Files:**
- Create: `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.ts`
- Create: `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.html`
- Create: `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.scss`

Self-contained component that injects `PantryPendientesSheetStateService` directly — same pattern as `PantryReceiptScanModalComponent` (`src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.ts`), reusing the canonical v4.5 sheet markup (`ion-modal.app-sheet-modal` → `.sheet-shell` → `.sheet-header` / `.sheet-body` / `ion-footer.sheet-footer`) and the shared `ExpiryPickerComponent` for the date field.

- [ ] **Step 1: Component class**

Create `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoodType } from '@core/models/shared/enums.model';
import { PantryPendientesSheetStateService } from '@core/services/pantry/modals/pantry-pendientes-sheet-state.service';
import { IonButton, IonChip, IonContent, IonFooter, IonIcon, IonModal, IonSpinner } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';

@Component({
  selector: 'app-pantry-pendientes-sheet',
  standalone: true,
  imports: [
    IonModal,
    IonContent,
    IonFooter,
    IonButton,
    IonIcon,
    IonChip,
    IonSpinner,
    ExpiryPickerComponent,
    TranslateModule,
  ],
  templateUrl: './pantry-pendientes-sheet.component.html',
  styleUrls: ['./pantry-pendientes-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryPendientesSheetComponent {
  readonly state = inject(PantryPendientesSheetStateService);
  readonly foodTypes = Object.values(FoodType);
}
```

- [ ] **Step 2: Template**

Create `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.html`:

```html
<ion-modal
  class="app-sheet-modal pendientes-sheet"
  [isOpen]="state.isOpen()"
  [breakpoints]="[0, 0.85, 1]"
  [initialBreakpoint]="0.85"
  [handle]="false"
  (didDismiss)="state.dismiss()">
  <ng-template>
    <div class="sheet-shell pendientes-sheet__content">
      <div class="sheet-handle" aria-hidden="true"></div>

      <header class="sheet-header">
        <div class="sheet-header__titles">
          <h2 class="sheet-header__title">{{ 'pantry.pendientesSheet.title' | translate }}</h2>
          <p class="sheet-header__subtitle">{{ 'pantry.pendientesSheet.subtitle' | translate }}</p>
        </div>
        <div class="sheet-header__actions">
          <ion-button
            fill="clear"
            color="medium"
            (click)="state.close()"
            [attr.aria-label]="'common.actions.close' | translate">
            <ion-icon slot="icon-only" name="close"></ion-icon>
          </ion-button>
        </div>
      </header>

      <div class="sheet-body">
        @if (state.rows().length) {
          <ul class="pendiente-rows">
            @for (row of state.rows(); track row.itemId) {
              <li class="pendiente-row">
                <p class="pendiente-row__name">{{ row.name }}</p>

                @if (row.needsFoodType) {
                  <div class="pendiente-row__food-types">
                    @for (type of foodTypes; track type) {
                      <ion-chip
                        class="food-type-chip"
                        [class.food-type-chip--active]="row.foodType === type"
                        button="true"
                        (click)="state.selectFoodType(row.itemId, type)">
                        {{ ('pantry.form.foodType.' + type) | translate }}
                      </ion-chip>
                    }
                  </div>
                }

                @if (row.needsDate) {
                  <app-expiry-picker
                    [date]="row.expirationDate"
                    [noExpiry]="row.noExpiry"
                    noDateKey="pantry.pendientesSheet.dateLabel"
                    (dateChange)="state.setExpirationDate(row.itemId, $event)"
                    (noExpiryToggle)="state.toggleNoExpiry(row.itemId)">
                  </app-expiry-picker>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="pendientes-sheet__empty">{{ 'pantry.pendientesSheet.empty' | translate }}</p>
        }
      </div>

      <ion-footer class="sheet-footer">
        <ion-button
          expand="block"
          shape="round"
          [disabled]="!state.hasTouchedRows() || state.isSaving()"
          (click)="state.saveAll()">
          @if (state.isSaving()) {
            <ion-spinner name="dots"></ion-spinner>
          } @else {
            {{ 'pantry.pendientesSheet.saveAll' | translate }}
          }
        </ion-button>
      </ion-footer>
    </div>
  </ng-template>
</ion-modal>
```

- [ ] **Step 3: Styles**

Create `src/app/features/pantry/components/pantry-pendientes-sheet/pantry-pendientes-sheet.component.scss`:

```scss
@use '../../../../shared/styles/modal-sheet' as sheet;

ion-modal.app-sheet-modal {
  @include sheet.sheet-base;
}

.sheet-shell {
  @include sheet.layout;
}

.sheet-handle {
  @include sheet.handle;
}

.sheet-header {
  @include sheet.header;
  @include sheet.glass-fallback;
}

.sheet-header__titles {
  flex: 1;
  min-width: 0;
}

.sheet-header__title {
  @include sheet.header-title;
}

.sheet-header__subtitle {
  @include sheet.header-subtitle;
}

.sheet-header__actions {
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-xs);
  flex-shrink: 0;
}

.sheet-body {
  @include sheet.body;
}

.sheet-footer {
  @include sheet.footer;
  @include sheet.glass-fallback;
}

.pendientes-sheet__empty {
  padding: var(--app-theme-spacing-3xl) var(--app-theme-spacing-lg);
  text-align: center;
  color: var(--app-theme-text-muted);
}

.pendiente-rows {
  list-style: none;
  margin: 0;
  padding: 0 0 var(--app-theme-spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--app-theme-spacing-sm);
}

.pendiente-row {
  display: flex;
  flex-direction: column;
  gap: var(--app-theme-spacing-sm);
  padding: var(--app-theme-spacing-sm-plus) var(--app-theme-spacing-md);
  border-radius: var(--app-theme-card-border-radius);
  background: var(--app-theme-card-bg);
  border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);

  &__name {
    margin: 0;
    font-size: var(--app-theme-font-size-body);
    font-weight: var(--app-theme-font-weight-bold);
    color: var(--app-theme-text-color);
  }

  &__food-types {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-theme-spacing-xs);
  }
}

.food-type-chip {
  --background: color-mix(in srgb, var(--ion-text-color) 7%, transparent);

  &--active {
    --background: var(--ion-color-primary);
    color: var(--ion-color-primary-contrast);
  }
}
```

- [ ] **Step 4: Verify the project compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors (component not yet referenced anywhere, so still dead code at this point — fine).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/pantry/components/pantry-pendientes-sheet
git commit -m "feat(pantry): add PantryPendientesSheetComponent"
```

---

### Task 8: Facade wiring — `PantryStateService`

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`

Three changes: inject the new state service + `PantryNavigationPresetService`, expose `openPendientesSheet`, make the `pendientes` filter chip open the sheet, and auto-open the sheet when arriving from the Insights CTA.

- [ ] **Step 1: Add imports and injections**

In `src/app/core/services/pantry/pantry-state.service.ts`, add to the import block (after line 18, the `PantryQuantitySheetStateService` import):

```ts
import { PantryPendientesSheetStateService } from './modals/pantry-pendientes-sheet-state.service';
import { PantryNavigationPresetService } from './pantry-navigation-preset.service';
```

Add to the constructor injections (after line 45, `private readonly quantitySheet = inject(PantryQuantitySheetStateService);`):

```ts
  private readonly pendientesSheet = inject(PantryPendientesSheetStateService);
  private readonly navigationPreset = inject(PantryNavigationPresetService);
```

- [ ] **Step 2: Expose `openPendientesSheet` on the facade**

Add next to the other `open*Modal`-style delegations (near line 391, alongside `openQuantitySheet`):

```ts
  openPendientesSheet = () => this.pendientesSheet.open();
```

- [ ] **Step 3: Open the sheet when the `pendientes` chip is tapped**

Replace `onFilterChipSelected` (`pantry-state.service.ts:222-228`):

```ts
  onFilterChipSelected(chip: FilterChipViewModel): void {
    if (chip.value) {
      this.applyStatusFilterPreset(chip.value);
      if (chip.value === 'pendientes') {
        this.openPendientesSheet();
      }
      return;
    }
    this.applyStatusFilterPreset('all');
  }
```

- [ ] **Step 4: Auto-open the sheet when arriving from the Insights CTA**

Replace `ionViewWillEnter` (`pantry-state.service.ts:197-205`):

```ts
  /** Lifecycle hook: ensure the store is primed and real-time updates are wired. */
  async ionViewWillEnter(): Promise<void> {
    this.skeletonManager.startLoading();
    this.pantryStore.clearEntryFilters();
    const shouldOpenPendientes = this.navigationPreset.peek()?.pendientes === true;
    this.pantryStore.applyPendingNavigationPreset();
    await this.loadItems();
    if (shouldOpenPendientes) {
      this.openPendientesSheet();
    }
    this.pantryStore.watchRealtime();
    this.skeletonManager.stopLoading();
  }
```

This peeks the pending preset *before* `applyPendingNavigationPreset()` consumes it, so we know whether the navigation that brought us here (`goToPendientes()` in Insights) requested `pendientes: true`, without touching `PantryNavigationPresetService` or `PantryQueryService` at all. The sheet opens after `loadItems()` so `pantryStore.loadedProducts()` is populated when `PantryPendientesSheetStateService.open()` filters it.

- [ ] **Step 5: Add the new modal to the "any edit modal open" gate**

So the background list doesn't refresh/lose items mid bulk-fix, replace `isAnyEditModalOpen` (`pantry-state.service.ts:148-154`):

```ts
  private readonly isAnyEditModalOpen = computed(() =>
    this.batchesModal.showBatchesModal() ||
    this.editItemModalRequest() !== null ||
    this.editFreshItemModalRequest() !== null ||
    this.quantitySheet.showQuantitySheet() ||
    this.consumeModal.consumeModalOpen() ||
    this.pendientesSheet.isOpen()
  );
```

- [ ] **Step 6: Verify the project compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/pantry/pantry-state.service.ts
git commit -m "feat(pantry): wire pendientes sheet into PantryStateService facade"
```

---

### Task 9: Page wiring — `PantryComponent`

**Files:**
- Modify: `src/app/features/pantry/pantry.component.ts`
- Modify: `src/app/features/pantry/pantry.component.html`

- [ ] **Step 1: Register the component and state service**

In `src/app/features/pantry/pantry.component.ts`, add imports (after line 42, the `PantryReceiptScanModalComponent` import):

```ts
import { PantryPendientesSheetStateService } from '@core/services/pantry/modals/pantry-pendientes-sheet-state.service';
import { PantryPendientesSheetComponent } from './components/pantry-pendientes-sheet/pantry-pendientes-sheet.component';
```

Add to the `imports` array (after line 79, `PantryReceiptScanModalComponent,`):

```ts
    PantryPendientesSheetComponent,
```

Add to the `providers` array (after line 95, `PantryReceiptScanModalStateService,`):

```ts
    PantryPendientesSheetStateService,
```

- [ ] **Step 2: Render the sheet**

In `src/app/features/pantry/pantry.component.html`, add right after line 228 (`<app-pantry-receipt-scan-modal></app-pantry-receipt-scan-modal>`):

```html
  <app-pantry-pendientes-sheet></app-pantry-pendientes-sheet>
```

- [ ] **Step 3: Verify the project compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/pantry/pantry.component.ts src/app/features/pantry/pantry.component.html
git commit -m "feat(pantry): mount PantryPendientesSheetComponent on the pantry page"
```

---

### Task 10: Manual verification (dev server)

No automated test covers the Angular service/component/DI wiring (matches this codebase's existing convention — see the note in the plan header). Verify by hand in the browser preview:

- [ ] **Step 1: Run the full unit test suite once**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS, including the new `pantry-filtering.domain.spec.ts`, `expiry-suggestion.domain.spec.ts`, and `pendiente-fix.domain.spec.ts` specs, with no regressions elsewhere.

- [ ] **Step 2: Start the dev server and open the app**

Use the project's dev server preview (`npm start` / `ng serve`, whatever `.claude/launch.json` or the project's existing dev-server config points to) and open the app in the browser preview tool.

- [ ] **Step 3: Seed at least one incomplete item**

Add a despensa item via the fast-add modal (FAB → "+") without setting a date. Confirm the "Pendientes" chip appears in the Despensa summary bar with count ≥ 1.

- [ ] **Step 4: Verify the chip opens the sheet**

Tap the "Pendientes" chip. Confirm:
- The sheet opens (title "Completar pendientes").
- The seeded item appears as a row.
- If it's missing foodType, 7 food-type chips render; tapping one highlights it and auto-fills a suggested date in the `app-expiry-picker` chip.
- The "Guardar todo" button is disabled until a row is touched.

- [ ] **Step 5: Verify save persists and clears the row**

Tap a food-type chip (and/or set a date), then tap "Guardar todo". Confirm:
- A toast confirms the update.
- The sheet closes.
- Re-opening the sheet (via the chip again) no longer shows that item as a row.
- Opening the item's full edit modal shows the foodType/date now saved.

- [ ] **Step 6: Verify the Insights entry point**

Navigate to the Insights tab (need Pro or dev-bypass per existing gating) with at least one pendiente item present. Tap the "mejorar calidad" CTA (`goToPendientes()`). Confirm it navigates to `/pantry` and the sheet auto-opens with the pendientes filter chip active underneath.

- [ ] **Step 7: Verify closing without saving doesn't lose data**

Open the sheet, touch a row's food type, then dismiss via the close (X) button without tapping "Guardar todo". Confirm nothing was persisted (item still shows as pendiente).

- [ ] **Step 8: Take a screenshot for the record**

Use the browser preview's screenshot capability on the open sheet (with at least one row) and share it in the session as visual confirmation.
