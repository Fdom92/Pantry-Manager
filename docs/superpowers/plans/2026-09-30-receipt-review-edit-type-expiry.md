# Receipt Review: Edit Type/Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user see and correct the food type and expiry date that a scanned receipt
line already infers, via an accordion per line that reuses the existing
`app-food-type-picker`/`app-expiry-picker` chips — instead of those values entering silently
on submit.

**Architecture:** Three new fields on `ReceiptReviewLine` (`foodType`, `expirationDate` +
`noExpiry`, `dateFromUser`) plus an `expanded` UI-only field; new state-service methods that
mirror the exact pattern already used by `pantry-add-entries-base.ts` for the manual add flow
(`setEntryFoodType`/`setEntryDate`/`setEntryNoExpiry`); `submit()` stops re-inferring and uses
whatever is on the line (possibly user-corrected). No new pure domain functions — every piece
of inference logic already exists and is reused as-is.

**Tech Stack:** Angular 20 standalone components, signals, `@ngx-translate/core`, existing
`app-food-type-picker`/`app-expiry-picker` shared components.

Design doc: `docs/superpowers/specs/2026-09-30-receipt-review-edit-type-expiry-design.md`.

---

## Before you start

Run from the repo root (`/Users/fernandodelolmomartin/Repos/pantry-manager`), on branch
`release/5.6`. Confirm clean tree first:

```bash
git status --short
```

If anything is uncommitted that isn't yours, stop and ask — don't touch it.

---

### Task 1: Model + state-service wiring — infer on scan, expose edit methods

**Files:**
- Modify: `src/app/core/models/receipt/receipt.model.ts`
- Modify: `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts`
- Test: `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.spec.ts` (new file)

- [ ] **Step 1: Extend `ReceiptReviewLine`**

In `src/app/core/models/receipt/receipt.model.ts`, add the import and extend the interface:

```ts
import type { FoodType } from '../shared/enums.model';
```

Add this import at the top of the file, alongside the existing `PantryItem` import.

Replace:

```ts
/** One line of the review screen. */
export interface ReceiptReviewLine {
  id: number;
  parsed: ParsedReceiptItem;
  /** Best matching existing pantry item, if any. */
  match: PantryItem | null;
  /** 0..1 similarity score of the match. */
  matchScore: number;
  /** Whether this line will be added on submit. */
  included: boolean;
  /** Editable quantity (starts at parsed.quantity). */
  quantity: number;
}
```

with:

```ts
/** One line of the review screen. */
export interface ReceiptReviewLine {
  id: number;
  parsed: ParsedReceiptItem;
  /** Best matching existing pantry item, if any. */
  match: PantryItem | null;
  /** 0..1 similarity score of the match. */
  matchScore: number;
  /** Whether this line will be added on submit. */
  included: boolean;
  /** Editable quantity (starts at parsed.quantity). */
  quantity: number;
  /**
   * Inferred (or user-picked) food type. Only meaningful — and only
   * editable — for lines that will create a brand-new product; a matched
   * line keeps the existing product's own type. null when nothing could be
   * inferred.
   */
  foodType: FoodType | null;
  /**
   * Inferred (or user-picked) expiry for the lot this line will add.
   * Undefined when unclassifiable and not marked no-expiry. Not applicable
   * to matched fresh items, which have no lot/expiry concept at all.
   */
  expirationDate?: string;
  noExpiry?: boolean;
  /** True once the user has touched the date/no-expiry picker for this line — mirrors AddEntry.dateFromUser, so a later food-type change doesn't clobber a date the user already set. */
  dateFromUser: boolean;
  /** Accordion state for the review row. Never persisted, UI-only. */
  expanded: boolean;
}
```

- [ ] **Step 2: Write the failing tests for the new state-service methods**

Create `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PantryReceiptScanModalStateService } from './pantry-receipt-scan-modal-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ReceiptLlmClientService } from '../../receipt/receipt-llm-client.service';
import { UpgradeRevenuecatService } from '../../upgrade/upgrade-revenuecat.service';
import { LocalStorageService } from '../../shared/local-storage.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';
import { AlertController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { FoodType } from '@core/models/shared/enums.model';
import type { ReceiptReviewLine } from '@core/models/receipt';
import type { PantryItem } from '@core/models/pantry';

describe('PantryReceiptScanModalStateService', () => {
  let service: PantryReceiptScanModalStateService;

  function makeLine(overrides: Partial<ReceiptReviewLine> = {}): ReceiptReviewLine {
    return {
      id: 1,
      parsed: { rawName: 'MANZANAS GOLDEN', quantity: 2, confidence: 'high' },
      match: null,
      matchScore: 0,
      included: true,
      quantity: 2,
      foodType: null,
      expirationDate: undefined,
      noExpiry: undefined,
      dateFromUser: false,
      expanded: false,
      ...overrides,
    };
  }

  function makeMatchedItem(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item-1',
      _rev: '1-abc',
      type: 'item',
      householdId: 'hh1',
      name: 'Leche entera',
      categoryId: '',
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1 }],
      productType: 'pantry',
      ...overrides,
    } as PantryItem;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PantryReceiptScanModalStateService,
        { provide: PantryStoreService, useValue: jasmine.createSpyObj('PantryStoreService', ['loadedProducts', 'addItem', 'addNewLot', 'updateItem'], { loadedProducts: () => [] }) },
        { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAddExistingItem', 'logAddNewItem']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: TranslateService, useValue: jasmine.createSpyObj('TranslateService', ['instant']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create']) },
        { provide: ReceiptLlmClientService, useValue: jasmine.createSpyObj('ReceiptLlmClientService', ['parse']) },
        { provide: UpgradeRevenuecatService, useValue: jasmine.createSpyObj('UpgradeRevenuecatService', ['isPro']) },
        { provide: LocalStorageService, useValue: { coachMark: jasmine.createSpyObj('coachMark', ['isShown', 'markShown']) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn']) },
      ],
    });
    service = TestBed.inject(PantryReceiptScanModalStateService);
  });

  describe('canEditFoodType / canEditExpiry / canExpand', () => {
    it('allows editing both for a brand-new line', () => {
      const line = makeLine();
      expect(service.canEditFoodType(line)).toBe(true);
      expect(service.canEditExpiry(line)).toBe(true);
      expect(service.canExpand(line)).toBe(true);
    });

    it('allows only expiry for a matched non-fresh line', () => {
      const matched = makeMatchedItem({ productType: 'pantry' });
      const line = makeLine({ match: matched, matchScore: 0.95 });
      expect(service.canEditFoodType(line)).toBe(false);
      expect(service.canEditExpiry(line)).toBe(true);
      expect(service.canExpand(line)).toBe(true);
    });

    it('allows neither for a matched fresh line', () => {
      const matched = makeMatchedItem({ productType: 'fresh' });
      const line = makeLine({ match: matched, matchScore: 0.95 });
      expect(service.canEditFoodType(line)).toBe(false);
      expect(service.canEditExpiry(line)).toBe(false);
      expect(service.canExpand(line)).toBe(false);
    });
  });

  describe('toggleExpanded', () => {
    it('flips only the targeted line', () => {
      service.reviewLines.set([makeLine({ id: 1 }), makeLine({ id: 2 })]);
      service.toggleExpanded(1);
      const lines = service.reviewLines();
      expect(lines.find(l => l.id === 1)?.expanded).toBe(true);
      expect(lines.find(l => l.id === 2)?.expanded).toBe(false);
      service.toggleExpanded(1);
      expect(service.reviewLines().find(l => l.id === 1)?.expanded).toBe(false);
    });
  });

  describe('setLineFoodType', () => {
    it('sets the type and re-suggests an expiry when the user has not set one', () => {
      service.reviewLines.set([makeLine({ id: 1, parsed: { rawName: 'MANZANAS GOLDEN', quantity: 2, confidence: 'high' } })]);
      service.setLineFoodType(1, FoodType.FRUIT);
      const line = service.reviewLines()[0];
      expect(line.foodType).toBe(FoodType.FRUIT);
      expect(line.expirationDate).toBeDefined();
    });

    it('keeps a date the user already set instead of overwriting it', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-12-25', dateFromUser: true })]);
      service.setLineFoodType(1, FoodType.NON_PERISHABLE);
      const line = service.reviewLines()[0];
      expect(line.expirationDate).toBe('2026-12-25');
    });
  });

  describe('setLineExpirationDate', () => {
    it('sets the date, clears noExpiry, and marks dateFromUser', () => {
      service.reviewLines.set([makeLine({ id: 1, noExpiry: true })]);
      service.setLineExpirationDate(1, '2026-11-01');
      const line = service.reviewLines()[0];
      expect(line.expirationDate).toBe('2026-11-01');
      expect(line.noExpiry).toBeUndefined();
      expect(line.dateFromUser).toBe(true);
    });

    it('clears the date when given undefined', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-11-01' })]);
      service.setLineExpirationDate(1, undefined);
      expect(service.reviewLines()[0].expirationDate).toBeUndefined();
    });
  });

  describe('setLineNoExpiry', () => {
    it('toggles no-expiry on and clears the date', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-11-01' })]);
      service.setLineNoExpiry(1);
      const line = service.reviewLines()[0];
      expect(line.noExpiry).toBe(true);
      expect(line.expirationDate).toBeUndefined();
      expect(line.dateFromUser).toBe(true);
    });

    it('toggles no-expiry back off', () => {
      service.reviewLines.set([makeLine({ id: 1, noExpiry: true })]);
      service.setLineNoExpiry(1);
      expect(service.reviewLines()[0].noExpiry).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/pantry-receipt-scan-modal-state.service.spec.ts'`
Expected: FAIL — `canEditFoodType`/`canEditExpiry`/`canExpand`/`toggleExpanded`/`setLineFoodType`/`setLineExpirationDate`/`setLineNoExpiry` are not functions yet, and `makeLine()`'s new fields don't satisfy the current (unextended) `ReceiptReviewLine` type. If Step 1 hasn't landed yet in your working copy, do that first — the type error is expected to surface here, not silently pass.

- [ ] **Step 4: Implement the new methods**

In `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts`, update the import line:

```ts
import { buildAddItemPayload } from '@core/domain/pantry/pantry-builder.domain';
import { restockFreshItem } from '@core/domain/pantry/fresh.domain';
import { resolveSuggestedExpiry, toLotExpiry, inferFoodType, expiryAfterFoodTypeChange } from '@core/domain/pantry/food-type-inference.domain';
```

(this replaces the existing `import { resolveSuggestedExpiry, toLotExpiry } from '@core/domain/pantry/food-type-inference.domain';` line — same module, two more named imports)

Also add:

```ts
import type { FoodType } from '@core/models/shared/enums.model';
```

Replace the line-construction block inside `startScan()`:

```ts
      const lines: ReceiptReviewLine[] = items.map((item, index) => {
        const match = matchReceiptName(item.rawName, candidates);
        const matchedItem = match ? itemsById.get(match.id) ?? null : null;
        return {
          id: index,
          parsed: item,
          match: matchedItem,
          matchScore: match?.score ?? 0,
          included: item.confidence !== 'low',
          quantity: item.quantity,
        };
      });
```

with:

```ts
      const lines: ReceiptReviewLine[] = items.map((item, index) => {
        const match = matchReceiptName(item.rawName, candidates);
        const matchedItem = match ? itemsById.get(match.id) ?? null : null;
        const base: ReceiptReviewLine = {
          id: index,
          parsed: item,
          match: matchedItem,
          matchScore: match?.score ?? 0,
          included: item.confidence !== 'low',
          quantity: item.quantity,
          foodType: null,
          expirationDate: undefined,
          noExpiry: undefined,
          dateFromUser: false,
          expanded: false,
        };
        // Reuse the same match/fresh predicates the rest of the service uses,
        // so "what can this line infer" never drifts from "what can this line
        // edit" (canEditFoodType/canEditExpiry below read the same predicates).
        const foodType = this.isAutoMatch(base) ? (matchedItem!.foodType ?? null) : inferFoodType(item.rawName);
        const suggested = this.isFreshMatch(base) ? {} : resolveSuggestedExpiry(item.rawName, foodType, new Date());
        return { ...base, foodType, expirationDate: suggested.expirationDate, noExpiry: suggested.noExpiry };
      });
```

Add these methods right after `isFreshMatch()`:

```ts
  /**
   * Type belongs to the product, not this lot — a matched line reuses the
   * existing product's own type and can't repoint it from the ticket.
   */
  canEditFoodType(line: ReceiptReviewLine): boolean {
    return !this.isAutoMatch(line);
  }

  /** Fresh matches restock via state (sufficient/low/none), no lot/date at all. */
  canEditExpiry(line: ReceiptReviewLine): boolean {
    return !this.isFreshMatch(line);
  }

  /** Whether this line has anything worth expanding the accordion for. */
  canExpand(line: ReceiptReviewLine): boolean {
    return this.canEditFoodType(line) || this.canEditExpiry(line);
  }

  toggleExpanded(id: number): void {
    this.reviewLines.update(lines =>
      lines.map(l => (l.id === id ? { ...l, expanded: !l.expanded } : l)),
    );
  }

  /**
   * Set the food type for a line. Re-suggests the expiry from the new type
   * unless the user already set a date themselves — same rule as the manual
   * add flow's setEntryFoodType.
   */
  setLineFoodType(id: number, foodType: FoodType): void {
    this.reviewLines.update(lines =>
      lines.map(l =>
        l.id === id
          ? { ...l, foodType, ...expiryAfterFoodTypeChange(l, foodType, new Date()) }
          : l,
      ),
    );
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_LINE_EDITED, { field: 'food_type' });
  }

  /** Set or clear the expiry date for a line. A cleared date is a decision too. */
  setLineExpirationDate(id: number, date: string | undefined): void {
    this.reviewLines.update(lines =>
      lines.map(l =>
        l.id === id
          ? { ...l, expirationDate: date || undefined, noExpiry: date ? undefined : l.noExpiry, dateFromUser: true }
          : l,
      ),
    );
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_LINE_EDITED, { field: 'expiration_date' });
  }

  /** Toggle "intentionally no expiry" for a line. Clears the date either way it lands. */
  setLineNoExpiry(id: number): void {
    this.reviewLines.update(lines =>
      lines.map(l => {
        if (l.id !== id) return l;
        const toggled = !l.noExpiry;
        return { ...l, noExpiry: toggled || undefined, expirationDate: toggled ? undefined : l.expirationDate, dateFromUser: true };
      }),
    );
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_LINE_EDITED, { field: 'expiration_date' });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/pantry-receipt-scan-modal-state.service.spec.ts'`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full test suite and build to confirm nothing else broke**

```bash
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

`submit()` still hardcodes `has_expiry: false` and still re-infers instead of reading the new
fields at this point — that's Task 2. The app must still build and every existing test must
still pass; the new fields/methods are additive only so far, nothing yet reads them at submit
time.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/receipt/receipt.model.ts src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.spec.ts
git commit -m "feat(receipt): infer foodType/expiry per line, expose edit methods

ReceiptReviewLine now carries the same foodType/expirationDate/
noExpiry fields the manual add flow already has, populated at scan
time with the existing inferFoodType/resolveSuggestedExpiry — no new
inference logic, just surfacing what already ran silently. New
setLineFoodType/setLineExpirationDate/setLineNoExpiry mirror
pantry-add-entries-base.ts's setEntryFoodType/setEntryDate/
setEntryNoExpiry exactly. submit() doesn't read these yet — that's
the next commit, kept separate so this one is pure additive plumbing."
```

---

### Task 2: `submit()` reads the line's values instead of re-inferring

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts`

- [ ] **Step 1: Stop re-inferring for the new-item branch**

In `submit()`, replace:

```ts
        } else {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: formatReceiptName(line.parsed.rawName),
            quantity: line.quantity,
          });
          const item: PantryItem = {
            ...base,
            productType: 'pantry',
            supermarket: this.detectedSupermarket() ?? undefined,
          };
          await this.pantryStore.addItem(item);
          await this.eventManager.logAddNewItem(item, line.quantity, sessionId, timestamp);
        }
```

with:

```ts
        } else {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: formatReceiptName(line.parsed.rawName),
            quantity: line.quantity,
            foodType: line.foodType ?? undefined,
            expirationDate: line.expirationDate,
            noExpiry: line.noExpiry,
            inferExpiry: false,
          });
          const item: PantryItem = {
            ...base,
            productType: 'pantry',
            supermarket: this.detectedSupermarket() ?? undefined,
          };
          await this.pantryStore.addItem(item);
          await this.eventManager.logAddNewItem(item, line.quantity, sessionId, timestamp);
        }
```

- [ ] **Step 2: Stop re-inferring for the matched (non-fresh) branch**

Replace:

```ts
          const updated = matchedItem.productType === 'fresh'
            ? restockFreshItem(matchedItem, timestamp, generateBatchId())
            : await this.pantryStore.addNewLot(matchedItem._id, {
                quantity: line.quantity,
                ...toLotExpiry(resolveSuggestedExpiry(matchedItem.name, matchedItem.foodType, new Date(timestamp))),
              });
```

with:

```ts
          const updated = matchedItem.productType === 'fresh'
            ? restockFreshItem(matchedItem, timestamp, generateBatchId())
            : await this.pantryStore.addNewLot(matchedItem._id, {
                quantity: line.quantity,
                expiryDate: line.expirationDate,
                noExpiry: line.noExpiry,
              });
```

(`toLotExpiry`/`resolveSuggestedExpiry` are no longer called from `submit()` after this — leave
their imports in place, `setLineFoodType` above still uses the domain module they come from
indirectly via `expiryAfterFoodTypeChange`, and `resolveSuggestedExpiry`/`toLotExpiry` are still
used by `startScan()`'s line construction from Task 1. Don't remove the import.)

- [ ] **Step 3: Fix the hardcoded `has_expiry` analytics field**

Replace:

```ts
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
          kind: 'despensa',
          source: 'receipt_scan',
          is_new: !this.isAutoMatch(line),
          quantity: line.quantity,
          has_expiry: false,
        });
```

with:

```ts
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
          kind: 'despensa',
          source: 'receipt_scan',
          is_new: !this.isAutoMatch(line),
          quantity: line.quantity,
          has_expiry: Boolean(line.expirationDate),
        });
```

- [ ] **Step 4: Verify**

```bash
npx ng lint
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: lint 0 errors, all tests pass (including Task 1's new spec — nothing there asserts
on `submit()`, so it stays green), build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts
git commit -m "fix(receipt): use the line's own foodType/expiry on submit

buildAddItemPayload and addNewLot both re-derived foodType/expiry
from scratch at submit time, silently discarding whatever the line
actually held (which, before this branch, was always identical to
the fresh inference anyway — but now can be a user correction).
Passes the line's values through with inferExpiry:false so a
user-cleared date reads as intentional, not \"nobody set one\".

Also fixes has_expiry:false being hardcoded in the PANTRY_ITEM_ADDED
analytics event regardless of whether a date was actually set — a
pre-existing telemetry bug in this same method, fixed while already
touching this exact line for an unrelated reason."
```

---

### Task 3: Accordion UI — template, component imports, styles, i18n

**Files:**
- Modify: `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.ts`
- Modify: `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.html`
- Modify: `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.scss`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Register the new component imports and pipe**

In `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.ts`,
replace:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonCheckbox,
  IonFooter,
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PantryReceiptScanModalStateService } from '@core/services/pantry/modals/pantry-receipt-scan-modal-state.service';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';

@Component({
  selector: 'app-pantry-receipt-scan-modal',
  standalone: true,
  imports: [IonModal, IonButton, IonIcon, IonSpinner, IonCheckbox, IonFooter, TranslateModule, ProPaywallCardComponent],
  templateUrl: './receipt-scan-modal.component.html',
  styleUrls: ['./receipt-scan-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryReceiptScanModalComponent {
  readonly state = inject(PantryReceiptScanModalStateService);
}
```

with:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonCheckbox,
  IonFooter,
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PantryReceiptScanModalStateService } from '@core/services/pantry/modals/pantry-receipt-scan-modal-state.service';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { FoodTypePickerComponent } from '@shared/components/food-type-picker/food-type-picker.component';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { ExpiryPipe } from '@shared/pipes/date-display.pipes';

@Component({
  selector: 'app-pantry-receipt-scan-modal',
  standalone: true,
  imports: [
    IonModal,
    IonButton,
    IonIcon,
    IonSpinner,
    IonCheckbox,
    IonFooter,
    TranslateModule,
    ProPaywallCardComponent,
    FoodTypePickerComponent,
    ExpiryPickerComponent,
    ExpiryPipe,
  ],
  templateUrl: './receipt-scan-modal.component.html',
  styleUrls: ['./receipt-scan-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryReceiptScanModalComponent {
  readonly state = inject(PantryReceiptScanModalStateService);
}
```

- [ ] **Step 2: Restructure the line markup**

In `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.html`,
replace the whole `<li class="receipt-line" ...>` block (everything from `<li class="receipt-line"`
through its matching closing `</li>`) with:

```html
                <li class="receipt-line" [class.receipt-line--excluded]="!line.included">
                  <div class="receipt-line__row">
                    <ion-checkbox
                      class="receipt-line__check"
                      [checked]="line.included"
                      (ionChange)="state.toggleLine(line.id)"
                      [attr.aria-label]="state.displayName(line)">
                    </ion-checkbox>

                    <div
                      class="receipt-line__body"
                      role="button"
                      tabindex="0"
                      (click)="state.editLineName(line.id)"
                      (keydown.enter)="state.editLineName(line.id)"
                      [attr.aria-label]="'pantry.receiptScan.editNameTitle' | translate">
                      <p class="receipt-line__name">{{ state.displayName(line) }}</p>
                      @if (state.isFreshMatch(line)) {
                        <p class="receipt-line__meta receipt-line__meta--match">
                          <ion-icon name="leaf-outline"></ion-icon>
                          {{ 'pantry.receiptScan.matchFresh' | translate }}
                        </p>
                      } @else if (state.isAutoMatch(line)) {
                        <p class="receipt-line__meta receipt-line__meta--match">
                          <ion-icon name="link-outline"></ion-icon>
                          {{ 'pantry.receiptScan.matchExisting' | translate }}
                          @if (line.foodType) {
                            · {{ 'pantry.form.foodType.' + line.foodType | translate }}
                          }
                          @if (line.noExpiry) {
                            · {{ 'pantry.batches.noExpiryIntentional' | translate }}
                          } @else if (line.expirationDate) {
                            · {{ line.expirationDate | appExpiry }}
                          }
                        </p>
                      } @else {
                        <p class="receipt-line__meta">
                          <ion-icon name="add-circle-outline"></ion-icon>
                          {{ 'pantry.receiptScan.createNew' | translate }}
                          @if (line.foodType) {
                            · {{ 'pantry.form.foodType.' + line.foodType | translate }}
                          }
                          @if (line.noExpiry) {
                            · {{ 'pantry.batches.noExpiryIntentional' | translate }}
                          } @else if (line.expirationDate) {
                            · {{ line.expirationDate | appExpiry }}
                          }
                        </p>
                      }
                    </div>

                    @if (!state.isFreshMatch(line)) {
                      <div class="receipt-line__qty">
                        <button
                          type="button"
                          class="receipt-line__qty-btn"
                          [disabled]="line.quantity <= 1"
                          (click)="state.adjustLineQuantity(line.id, -1)"
                          [attr.aria-label]="'pantry.receiptScan.decrease' | translate">−</button>
                        <span class="receipt-line__qty-value">{{ line.quantity }}</span>
                        <button
                          type="button"
                          class="receipt-line__qty-btn"
                          (click)="state.adjustLineQuantity(line.id, 1)"
                          [attr.aria-label]="'pantry.receiptScan.increase' | translate">+</button>
                      </div>
                    }

                    @if (state.canExpand(line)) {
                      <button
                        type="button"
                        class="receipt-line__expand-btn"
                        (click)="state.toggleExpanded(line.id)"
                        [attr.aria-expanded]="line.expanded"
                        [attr.aria-label]="'pantry.receiptScan.toggleDetails' | translate">
                        <ion-icon [name]="line.expanded ? 'chevron-up-outline' : 'chevron-down-outline'"></ion-icon>
                      </button>
                    }
                  </div>

                  @if (line.expanded && state.canExpand(line)) {
                    <div class="receipt-line__details">
                      @if (state.canEditFoodType(line)) {
                        <app-food-type-picker
                          [foodType]="line.foodType"
                          (foodTypeChange)="state.setLineFoodType(line.id, $event)">
                        </app-food-type-picker>
                      }
                      @if (state.canEditExpiry(line)) {
                        <app-expiry-picker
                          [mode]="'picker-only'"
                          [date]="line.expirationDate"
                          [noExpiry]="line.noExpiry ?? false"
                          (dateChange)="state.setLineExpirationDate(line.id, $event)"
                          (noExpiryToggle)="state.setLineNoExpiry(line.id)">
                        </app-expiry-picker>
                      }
                    </div>
                  }
                </li>
```

- [ ] **Step 3: Restructure the SCSS for the new row/details split**

In `src/app/features/pantry/components/receipt-scan-modal/receipt-scan-modal.component.scss`,
replace:

```scss
.receipt-line {
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-md);
  padding: var(--app-theme-spacing-sm-plus) var(--app-theme-spacing-md);
  border-radius: var(--app-theme-card-border-radius);
  background: var(--app-theme-card-bg);
  border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);
  transition: opacity var(--app-theme-transition-fast);

  &--excluded {
    opacity: 0.45;
  }

  &__check {
    flex-shrink: 0;
  }
```

with:

```scss
.receipt-line {
  display: flex;
  flex-direction: column;
  padding: var(--app-theme-spacing-sm-plus) var(--app-theme-spacing-md);
  border-radius: var(--app-theme-card-border-radius);
  background: var(--app-theme-card-bg);
  border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);
  transition: opacity var(--app-theme-transition-fast);

  &--excluded {
    opacity: 0.45;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: var(--app-theme-spacing-md);
  }

  &__check {
    flex-shrink: 0;
  }
```

Then, right after the existing `&__qty-value { ... }` rule (the last rule in the file, just
before the closing `}` of `.receipt-line`), add two new rules:

```scss

  &__expand-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: var(--app-theme-radius-circle);
    border: none;
    background: transparent;
    color: var(--app-theme-text-muted);
    display: grid;
    place-items: center;

    &:active { background: color-mix(in srgb, var(--ion-text-color) 7%, transparent); }
  }

  &__details {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-theme-spacing-xs);
    margin-top: var(--app-theme-spacing-sm);
    padding-top: var(--app-theme-spacing-sm);
    border-top: 1px dashed var(--app-theme-card-border-color);
  }
```

- [ ] **Step 4: Add the one new i18n key, all 6 bundles**

Add `toggleDetails` under the existing `pantry.receiptScan` object in
`src/assets/i18n/{es,en,de,fr,it,pt}.json`. Every other key referenced by this task
(`pantry.form.foodType.*`, `pantry.batches.noExpiryIntentional`, `pantry.receiptScan.matchFresh`
/`matchExisting`/`createNew`) already exists in all 6 bundles — this is the only addition.

Example for `es.json` — find the `pantry.receiptScan` object and add the key (anywhere inside
it, e.g. right after `"pickerError"`):

```json
"toggleDetails": "Ver tipo y caducidad"
```

English (`en.json`): `"toggleDetails": "Show type and expiry"`.
German (`de.json`): `"toggleDetails": "Typ und Ablaufdatum anzeigen"`.
French (`fr.json`): `"toggleDetails": "Voir le type et la date de péremption"`.
Italian (`it.json`): `"toggleDetails": "Mostra tipo e scadenza"`.
Portuguese (`pt.json`): `"toggleDetails": "Ver tipo e validade"`.

- [ ] **Step 5: Verify**

```bash
npx ng lint
node scripts/check-icons.mjs
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```

Expected: lint 0 errors (the two new chevron icon names are already registered in
`src/app/app-icons.ts` — `chevron-up-outline`/`chevron-down-outline` — so `check-icons.mjs`
should pass without any change there; if it doesn't, something's off and needs investigating,
don't add a duplicate registration), tests pass, build succeeds.

- [ ] **Step 6: Verify in the browser**

The camera/OCR itself can't run in the browser dev server (`CLAUDE.md`: APK-only) — simulate
review lines directly via the console instead. Start the dev server, open the pantry tab, open
dev tools console, and run something like:

```js
const comp = ng.getComponent(document.querySelector('app-pantry-receipt-scan-modal'));
comp.state.isOpen.set(true);
comp.state.phase.set('review');
comp.state.reviewLines.set([
  { id: 1, parsed: { rawName: 'MANZANAS GOLDEN', quantity: 2, confidence: 'high' }, match: null, matchScore: 0, included: true, quantity: 2, foodType: 'fruit', expirationDate: '2026-10-20', noExpiry: false, dateFromUser: false, expanded: false },
  // add a second line with a non-null `match` (an existing pantry item, productType 'pantry')
  // and a third with productType 'fresh', to see all three accordion variants
]);
```

Confirm: collapsed rows show the combined summary line; the expand arrow only appears on lines
with something editable; expanding a new-item line shows both pickers, a matched-pantry line
shows only the expiry picker, a matched-fresh line shows no arrow at all; picking a new food
type updates the summary line when collapsed again; the household of existing modals (add
modal, fresh add modal) still look and behave exactly as before (nothing shared was touched
beyond the two picker components themselves, which weren't modified).

- [ ] **Step 7: Commit**

```bash
git add src/app/features/pantry/components/receipt-scan-modal/ src/assets/i18n/
git commit -m "feat(receipt): accordion to edit type/expiry per review line

Reuses app-food-type-picker/app-expiry-picker as-is — same components
the manual add flow already shows inline, just behind a collapse/
expand toggle here so a 15-20 line ticket doesn't turn into 15-20
rows of always-visible chips. Collapsed rows fold the inferred type/
expiry into the existing match-status line instead of adding a
second line of text, to keep row height roughly what it was before."
```

---

### Task 4: Manual device QA note

No code changes — this task is a checklist, not a commit. Per `CLAUDE.md`, the actual
camera/OCR pipeline only runs on-device.

- [ ] Build a debug APK (`npm run prepare:build`, then run from Android Studio) and scan a
  real receipt.
- [ ] Confirm the collapsed summary line reads naturally for a few different product types
  (not just fruit — try something the name-inference dictionary won't recognise, to see the
  `foodType: null` / no-summary-fragment case render cleanly).
- [ ] Expand a new-item line, change the type, confirm the expiry re-suggests (unless you'd
  already touched the date yourself).
- [ ] Expand a matched-pantry line (a product already in the despensa), confirm only the
  expiry picker shows, correct the date, submit, and check the resulting lot's date in
  Despensa matches what you picked — not the original inferred date.
- [ ] Confirm a matched-fresh line (an existing "fresco" product) shows no expand arrow at
  all.
- [ ] Confirm the existing "editar nombre" tap-to-rename still works exactly as before (the
  expand arrow must not have hijacked that tap target).

---

## Self-Review Notes (already applied above, kept for the reviewer)

- **Spec coverage:** every requirement from the design doc maps to a task — inference already
  existed and needed no new task; edit methods (Task 1); submit() reading corrected values +
  telemetry fix (Task 2, explicitly called out in the design doc's own "de paso" section);
  accordion UI reusing existing pickers (Task 3); the editability table from the design doc
  (new=both, matched-non-fresh=expiry only, matched-fresh=neither) is exactly what
  `canEditFoodType`/`canEditExpiry`/`canExpand` implement.
- **Dead code:** none created — `toLotExpiry`/`resolveSuggestedExpiry` stay in use by
  `startScan()`'s line construction even though `submit()` stops calling them directly.
- **Type consistency:** `ReceiptReviewLine.foodType` (`FoodType | null`) matches
  `app-food-type-picker`'s `[foodType]` input type exactly (`FoodType | null`) — no cast
  needed at the call site. `expirationDate`/`noExpiry` match `app-expiry-picker`'s
  `date?: string`/`noExpiry = false` inputs (the template passes `line.noExpiry ?? false` to
  bridge `boolean | undefined` → `boolean`, matching how `entity-selector-modal.component.html`
  already does the same bridge for `AddEntry.noExpiry`).
- **Task-boundary build safety:** Task 1 leaves `submit()` untouched (still compiles, still
  passes existing tests, new fields simply unused by it yet) — verified explicitly in Task 1
  Step 6. Task 2 depends on Task 1's fields existing. Task 3 depends on Task 1's methods and
  Task 2's corrected `submit()` behavior being in place, though nothing in Task 3 itself would
  fail to compile if Task 2 were skipped — the UI would just show corrections that don't
  survive submit, which is why the tasks are ordered 1→2→3 and not any other way.
