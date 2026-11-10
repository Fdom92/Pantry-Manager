# Glossary

Domain vocabulary. The UI is Spanish-first and the code English-first; some Spanish words are
kept in code on purpose because they are what the user sees.

## Products

- **Despensa** / pantry product — `PantryItem` with `productType: 'pantry'` (or unset). Real
  quantities held in lots, consumed FIFO, explicit expiry dates.
- **Fresco** / fresh product — same `PantryItem` shape, `productType: 'fresh'`. Quantity is a
  state: `FreshState` `sufficient` (3) / `low` (1) / `none` (0).
- **Basic / "Mantener siempre en casa"** — `isBasic: true` (the star). The shopping list only
  suggests basic products. Un-starring clears `minThreshold` (`setBasic`, `core/domain/pantry/basic.domain.ts`).
  The UI never says "basic".
- **minThreshold** — for a basic despensa product, the list suggests restocking below it.
- **Pendientes** — products missing data the alerts depend on (food type and/or expiry).
  Predicate `isIncomplete`; fixed in bulk from the pendientes sheet.

## Lots and quantities

- **Lote / batch** — `ItemBatch`: `quantity`, optional `expirationDate`, `opened`, `locationId`, `noExpiry`,
  plus the batch states below.
- **FIFO** — consumption takes from the earliest-expiring lot first (`pantry-batch.domain.ts`).
- **Batch states** (`batch-state.domain.ts`, 5.7) — **abierto** (`opened`, `openedAt`,
  `printedExpirationDate`): opening shortens the date by `openedShelfDays(foodType)` and moves the
  lot to the fridge. **congelado** (`frozenAt`, `frozenDaysLeft`): the lot has *no* date while
  frozen, so nothing expires, notifies or counts as waste; thawing gives at most `THAW_MAX_DAYS`.
  Lots only merge with lots in the same state.
- **Lote que toca** — `dueBatchIndex`: opened first, then earliest date, dateless last. The
  quantity sheet's one-tap actions (Abrir 1, Mover 1, Congelar 1, Descongelar 1, Se tiró 1) act on
  one unit of it. Moving and opening are not consuming.
- **Nevera / Congelador** — locations are free text; `findFridgeLocation` / `findFreezerLocation`
  recognise them by name in the six languages.
- **Total quantity** — `sumQuantities(batches)`. A despensa product at 0 disappears from the
  pantry screen (it still exists, and the list may suggest it).
- **noExpiry** — the user confirmed the lot doesn't expire, so it isn't "missing a date".
- **Agotar** — set a product to 0 in one tap from the quantity sheet.

## Classifications (`core/models/shared/enums.model.ts`)

- **ExpirationStatus** — `ok | near-expiry | expired`, from the earliest lot with a date.
- **FoodType** — `protein | carb | vegetable | fruit | dairy | beverage | non-perishable | household | other`.
  Shelf life and expiry mode per type live in `FOOD_TYPE_PROFILE`
  (`core/domain/pantry/food-type-profile.domain.ts`). Food type and a suggested date are inferred
  from the product name when it is added (`food-type-inference.domain.ts`).
- **Learned shelf life** (`learned-shelf-life.domain.ts`, `ShelfLifeLearningService`, 5.7) — a lot
  added without a date gets the median days-to-expiry of the product's last five dated `ADD`
  events (by product id, then by name). The food-type table is only the fallback: do not add
  per-product exceptions to it. Every add flow passes it to `resolveSuggestedExpiry`.
- **Catalogs** — categories, locations and supermarkets are string lists in `AppPreferences`
  (`categoryOptions`, `locationOptions`, `supermarketOptions`), not separate documents.

## Shopping list

- **Suggestion** — automatic entry for a basic product; reason `empty | below-min | fresh-empty | fresh-low`.
- **Manual item** — typed by the user, stored in `localStorage`; kept until bought or removed.
  Hidden while an automatic suggestion with the same normalised name is pending.
- **Bought** — marked during the current visit; buying restocks the pantry. Read-only rows.
- **Ocultos ahora / hidden for now** — suggestions dismissed for this visit only; cleared when
  leaving the tab.
- Row interaction: the row's button buys; tapping the row opens its action menu (`listRowActions`).

## Receipt scan

- Photo → on-device OCR (ML Kit) → rows → parser → review sheet → bulk add. APK only.
- **Free parser** — rule-based, `core/domain/receipt/`. **Smart scan (PRO)** — the backend's LLM
  parses the OCR rows instead.
- **Quantity-first table** — layout whose header puts `Cant` before `Descripción` (Family Cash):
  own reader, quantity from importe ÷ precio when whole.

## History events

- **PantryEvent** — append-only audit record; `PantryEventType` `ADD | CONSUME | EDIT | EXPIRE | DELETE`.
  Written through `HistoryEventManagerService`; not shown in the UI. The waste tracker counts `EXPIRE`.
  "Se tiró" is an `EXPIRE` with `source: 'discard'`, no `expirationDate` and its own `batchKey`.
  The expired-batch sweep deletes `EXPIRE` events that repeat a batch (keeps the oldest).
- **EventSource** — where the action came from (`add_modal`, `consume_modal`, `quantity_sheet`…).

## Notifications

- **Definition** — expired items, near expiry, low stock, re-engagement, plus the welcome
  notification and streak milestones.
- **Scheduler** — projects the next 7 days; for each day schedules only the highest-priority
  definition with something to say. Runs on boot, on every foreground and on preference changes.
- **unavailable** — permission state when the plugin fails; never treated as a user denial.

## Monetisation and analytics

- **PRO** — RevenueCat subscription; unlocks AI insights and smart receipt scan. Non-production
  builds behave as PRO.
- **install_source** — PostHog person property: `play | sideload | other | unknown`. Analyses
  filter `play` to exclude development installs.
