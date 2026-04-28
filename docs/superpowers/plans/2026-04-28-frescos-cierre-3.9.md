# Frescos 3.9 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la feature de productos frescos para la v3.9: simplificar el modal de añadir, unificar la UI del modal de editar con despensa, mejorar la card de frescos en estado expirado, ordenar frescos alfabéticamente y añadir toggle de agrupación por categorías en despensa.

**Architecture:** Todos los cambios son aditivos o de refactoring de UI — sin cambios en el modelo de datos ni en la capa de almacenamiento PouchDB. Los cambios de estado (`groupByCategory`, `flatDespensaItems`, `isExpired`) se añaden como computed signals en los servicios existentes. La shared component `entity-selector-modal` recibe una nueva prop `showEntryQuantity` que es backward-compatible.

**Tech Stack:** Angular 20 standalone components, Ionic 8, Signals (`signal()`, `computed()`), `@ngx-translate`, SCSS con BEM y CSS custom properties `--app-theme-*`.

---

## File Map

| Archivo | Rol en este plan |
|---------|-----------------|
| `src/app/core/services/pantry/pantry-state.service.ts` | Sort frescos alfabético + `groupByCategory` signal + `flatDespensaItems` |
| `src/app/features/pantry/pantry.component.html` | Toggle de categorías en header despensa + bifurcación flat/grouped |
| `src/assets/i18n/es.json` | Nuevas keys i18n del toggle |
| `src/assets/i18n/en.json` | Ídem |
| `src/assets/i18n/de.json` | Ídem |
| `src/assets/i18n/fr.json` | Ídem |
| `src/assets/i18n/it.json` | Ídem |
| `src/assets/i18n/pt.json` | Ídem |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.ts` | Añadir `isExpired()`, actualizar `expiryLabel` y `expiryUrgency` |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.html` | Label siempre visible, `data-expired`, `[disabled]` en segment |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.scss` | Estilos estado expirado |
| `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.ts` | Nueva `@Input() showEntryQuantity = true` |
| `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.html` | Condicional ± buttons / × button según `showEntryQuantity` |
| `src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts` | Eliminar `keepInStock`, `setEntryDate`, `setEntryNoExpiry` |
| `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html` | Simplificar bindings: sin fecha, sin cantidad, sin keepInStock |
| `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.html` | Restructurar con `.form-section` cards |
| `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.scss` | Adoptar estilos form-section, eliminar reglas obsoletas |

---

## Task 1: Sort frescos alfabéticamente

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts:98-112`

- [ ] **Step 1: Localizar el computed `freshItems` en pantry-state.service.ts**

  Está en las líneas ~98-112. El comparador actual ordena por `quantity desc → expirationDate asc`.

- [ ] **Step 2: Reemplazar el comparador**

  Cambiar el `.sort(...)` a:

  ```typescript
  readonly freshItems = computed(() =>
    this.pantryItemsState()
      .filter(i => i.productType === 'fresh')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  );
  ```

- [ ] **Step 3: Build check**

  ```bash
  cd /Users/fernandodelolmomartin/Repos/pantry-manager
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores de compilación.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/core/services/pantry/pantry-state.service.ts
  git commit -m "feat(fresh): sort fresh items alphabetically instead of by quantity"
  ```

---

## Task 2: Despensa — toggle de agrupación por categorías

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`
- Modify: `src/app/features/pantry/pantry.component.html`
- Modify: `src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`

### 2a: Añadir signals al servicio

- [ ] **Step 1: Añadir `groupByCategory`, `toggleGroupByCategory` y `flatDespensaItems` en pantry-state.service.ts**

  Buscar la línea donde está `readonly groups = computed(...)` (~línea 136) y añadir justo después:

  ```typescript
  readonly groupByCategory = signal(false);
  toggleGroupByCategory(): void { this.groupByCategory.update(v => !v); }
  readonly flatDespensaItems = computed(() =>
    [...this.despensaItems()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  );
  ```

### 2b: Actualizar el template de la sección despensa

- [ ] **Step 2: Añadir el botón toggle en el header de la sección despensa**

  En `pantry.component.html` (~línea 105), reemplazar el bloque `<header class="pantry-section__header pantry-section__header--despensa">` completo con:

  ```html
  <header class="pantry-section__header pantry-section__header--despensa">
    <h3 class="pantry-section__title">{{ 'pantry.sections.pantry' | translate }}</h3>
    <div class="pantry-section__actions">
      <button
        class="pantry-section__add-btn"
        [attr.aria-label]="(facade.groupByCategory() ? 'pantry.sections.groupToggle.grouped' : 'pantry.sections.groupToggle.flat') | translate"
        (click)="facade.toggleGroupByCategory()">
        <ion-icon [name]="facade.groupByCategory() ? 'list-outline' : 'apps-outline'"></ion-icon>
      </button>
      <button
        class="pantry-section__add-btn"
        [attr.aria-label]="'pantry.fastAdd.groupLabel' | translate"
        (click)="facade.openAddModal()">
        <ion-icon name="add-circle-outline"></ion-icon>
      </button>
      <button
        class="pantry-section__add-btn pantry-section__consume-btn"
        [attr.aria-label]="'pantry.consume.groupLabel' | translate"
        (click)="facade.openConsumeModal()">
        <ion-icon name="remove-circle-outline"></ion-icon>
      </button>
    </div>
  </header>
  ```

- [ ] **Step 3: Bifurcar la lista despensa entre flat y agrupada**

  En `pantry.component.html`, el bloque `@else {` (~línea 136) que contiene el `<div class="category-stack fade-in-list">` con los grupos debe reemplazarse así (el bloque `@else if (facade.despensaItems().length === 0)` no cambia):

  ```html
  } @else {
    @if (facade.groupByCategory()) {
      <div class="category-stack fade-in-list">
        @for (group of facade.groups(); track group.key) {
          <div class="virtual-category-card">
            <ion-card>
              <ion-card-header
                class="group-header"
                role="button"
                tabindex="0"
                [attr.aria-expanded]="!facade.isGroupCollapsed(group.key)"
                [attr.aria-label]="facade.isGroupCollapsed(group.key) ? ('pantry.group.expand' | translate:{ name: group.name }) : ('pantry.group.collapse' | translate:{ name: group.name })"
                (click)="facade.toggleGroupCollapse(group.key, $event)"
                (keydown)="facade.onGroupHeaderKeydown(group.key, $event)"
                [class.group-header--collapsed]="facade.isGroupCollapsed(group.key)">
                <section class="group-details">
                  <div class="group-title">
                    <ion-card-title>{{ group.name }}</ion-card-title>
                  </div>
                  <div class="group-meta">
                    <ion-text color="medium">
                      {{ 'pantry.group.count' | translate:{ count: group.items.length } }}
                    </ion-text>
                    <ion-icon
                      class="group-toggle-icon"
                      [name]="facade.isGroupCollapsed(group.key) ? 'chevron-down-outline' : 'chevron-up-outline'">
                    </ion-icon>
                  </div>
                </section>
              </ion-card-header>
            </ion-card>
          </div>
          @if (!facade.isGroupCollapsed(group.key)) {
            @for (item of group.items; track facade.trackByItemId($index, item)) {
              <div
                class="virtual-item-card"
                [class.virtual-item-card--deleting]="facade.isDeleting(item)">
                @let card = facade.buildItemCardViewModel(item);
                <app-pantry-detail
                  class="virtual-item-card__detail"
                  [viewModel]="card"
                  (cardClicked)="facade.openQuantitySheet(item, $event)"
                ></app-pantry-detail>
              </div>
            }
          }
        }
      </div>
    } @else {
      <div class="category-stack fade-in-list">
        @for (item of facade.flatDespensaItems(); track facade.trackByItemId($index, item)) {
          <div
            class="virtual-item-card"
            [class.virtual-item-card--deleting]="facade.isDeleting(item)">
            @let card = facade.buildItemCardViewModel(item);
            <app-pantry-detail
              class="virtual-item-card__detail"
              [viewModel]="card"
              (cardClicked)="facade.openQuantitySheet(item, $event)"
            ></app-pantry-detail>
          </div>
        }
      </div>
    }
  }
  ```

### 2c: Añadir i18n keys

- [ ] **Step 4: Añadir keys en es.json**

  Buscar `"sections": {` dentro del objeto `"pantry"` (~línea 150 en es.json). Añadir `"groupToggle"` dentro de ese objeto:

  ```json
  "sections": {
    "fresh": "Frescos",
    "pantry": "Despensa",
    "groupToggle": {
      "flat": "Agrupar por categoría",
      "grouped": "Vista plana"
    }
  }
  ```

- [ ] **Step 5: Añadir keys en en.json** (misma ubicación, mismo bloque `sections`)

  ```json
  "groupToggle": {
    "flat": "Group by category",
    "grouped": "Flat list"
  }
  ```

- [ ] **Step 6: Añadir keys en de.json**

  ```json
  "groupToggle": {
    "flat": "Nach Kategorie gruppieren",
    "grouped": "Listenansicht"
  }
  ```

- [ ] **Step 7: Añadir keys en fr.json**

  ```json
  "groupToggle": {
    "flat": "Grouper par catégorie",
    "grouped": "Vue liste"
  }
  ```

- [ ] **Step 8: Añadir keys en it.json**

  ```json
  "groupToggle": {
    "flat": "Raggruppa per categoria",
    "grouped": "Vista lista"
  }
  ```

- [ ] **Step 9: Añadir keys en pt.json**

  ```json
  "groupToggle": {
    "flat": "Agrupar por categoria",
    "grouped": "Vista plana"
  }
  ```

- [ ] **Step 10: Build check**

  ```bash
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores.

- [ ] **Step 11: Commit**

  ```bash
  git add src/app/core/services/pantry/pantry-state.service.ts \
          src/app/features/pantry/pantry.component.html \
          src/assets/i18n/es.json src/assets/i18n/en.json \
          src/assets/i18n/de.json src/assets/i18n/fr.json \
          src/assets/i18n/it.json src/assets/i18n/pt.json
  git commit -m "feat(pantry): add category grouping toggle to despensa section"
  ```

---

## Task 3: Fresh item card — tratamiento del estado expirado

**Files:**
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.ts`
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.html`
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.scss`

### 3a: Actualizar el componente TS

- [ ] **Step 1: Añadir `isExpired` computed y actualizar `expiryLabel` y `expiryUrgency`**

  Reemplazar el bloque de signals computadas (líneas ~24-41) con:

  ```typescript
  readonly isExpired = computed((): boolean => {
    const d = this.daysToExpiry();
    return d !== null && d < 0;
  });

  readonly expiryUrgency = computed((): 'critical' | 'warning' | 'neutral' => {
    const d = this.daysToExpiry();
    if (d === null) return 'neutral';
    if (d < 0) return 'critical';
    if (d <= 1) return 'critical';
    if (d <= 3) return 'warning';
    return 'neutral';
  });

  readonly expiryLabel = computed((): string => {
    const d = this.daysToExpiry();
    if (d === null) return '';
    if (d < 0) return 'pantry.fresh.card.expired';
    if (d === 0) return 'pantry.fresh.card.today';
    if (d === 1) return 'pantry.fresh.card.tomorrow';
    if (d <= 3) return 'pantry.fresh.card.soon';
    return '';
  });
  ```

  Cambios respecto al original:
  - Se añade `isExpired`.
  - `expiryLabel` elimina el early return `if (this.currentState() === 'none') return ''` — ahora los items con `state='none'` también muestran el label de caducidad.
  - `expiryUrgency` elimina el early return `if (this.currentState() === 'none') return 'neutral'` por la misma razón.

- [ ] **Step 2: Proteger `onStateSelected` contra clicks cuando expirado**

  ```typescript
  onStateSelected(state: FreshState): void {
    if (this.isExpired()) return;
    if (state === this.currentState()) return;
    this.stateChange.emit({ item: this.item, state });
  }
  ```

### 3b: Actualizar el template HTML

- [ ] **Step 3: Reemplazar fresh-item-card.component.html completamente**

  ```html
  <div class="fresh-item-card">
    <div
      class="fresh-item-card__info"
      [attr.data-expired]="isExpired() || null"
      role="button"
      tabindex="0"
      (click)="onEdit()"
      (keydown.enter)="onEdit()"
      (keydown.space)="$event.preventDefault(); onEdit()">
      <span class="fresh-item-card__name">{{ item.name }}</span>
      @if (expiryLabel()) {
        <span class="fresh-item-card__expiry" [attr.data-urgency]="expiryUrgency()">
          {{ expiryLabel() | translate }}
        </span>
      }
    </div>

    <div
      class="fresh-item-card__segment"
      [attr.data-expired]="isExpired() || null"
      role="radiogroup"
      [attr.aria-label]="('pantry.fresh.state.label' | translate)">
      @for (state of states; track state) {
        <button
          type="button"
          role="radio"
          class="fresh-item-card__segment-btn"
          [class.is-active]="currentState() === state"
          [attr.data-state]="state"
          [attr.aria-checked]="currentState() === state ? 'true' : 'false'"
          [attr.aria-label]="(labelKey(state) | translate)"
          [disabled]="isExpired()"
          (click)="onStateSelected(state)">
          {{ labelKey(state) | translate }}
        </button>
      }
    </div>
  </div>
  ```

  Nota: `[attr.data-expired]="isExpired() || null"` pone el atributo cuando `true` y lo elimina cuando `false` (Angular elimina atributos `null`).

### 3c: Actualizar los estilos SCSS

- [ ] **Step 4: Añadir estilos de estado expirado en fresh-item-card.component.scss**

  Añadir al final del fichero (antes del cierre `}`):

  ```scss
  // Estado expirado: barrita roja en __info, segment desactivado

  &__info[data-expired] {
    border-left: 3px solid var(--app-theme-card-accent-critical, var(--ion-color-danger));
    padding-left: 8px;
  }

  &__expiry[data-urgency='critical'] {
    font-size: 0.8rem;
  }

  &__segment[data-expired] {
    opacity: 0.6;
    pointer-events: none;

    .fresh-item-card__segment-btn.is-active {
      background: var(--ion-color-medium);
      color: var(--ion-color-medium-contrast, white);
    }
  }
  ```

  El `pointer-events: none` refuerza el `[disabled]` para que el segment no responda a ningún click cuando está expirado.

- [ ] **Step 5: Build check**

  ```bash
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/features/pantry/components/fresh-item-card/
  git commit -m "feat(fresh): show expired state on card with disabled segment and red accent"
  ```

---

## Task 4: Entity selector modal — prop `showEntryQuantity`

Esta tarea modifica un componente compartido. El cambio es backward-compatible: `showEntryQuantity` tiene default `true`, por lo que todos los usos existentes (modal de despensa) no se ven afectados.

**Files:**
- Modify: `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.ts`
- Modify: `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.html`

- [ ] **Step 1: Añadir `@Input() showEntryQuantity = true` en entity-selector-modal.component.ts**

  Añadir justo después de `@Input() showEntryNoExpiry = false;` (~línea 72):

  ```typescript
  @Input() showEntryQuantity = true;
  ```

- [ ] **Step 2: Actualizar el template para condicionar la quantity y mostrar × cuando está oculta**

  En `entity-selector-modal.component.html`, localizar el bloque `<div class="entity-selector-quantity">` (~línea 50). Reemplazarlo con:

  ```html
  @if (showEntryQuantity) {
    <div class="entity-selector-quantity">
      <ion-button
        fill="clear"
        size="small"
        [disabled]="entry.quantity <= 0"
        (click)="adjustEntry.emit({ entry, delta: -1 })">
        <ion-icon slot="icon-only" name="remove-outline"></ion-icon>
      </ion-button>
      <ion-text class="entity-selector-qty">{{ entry.quantity }}</ion-text>
      <ion-button
        fill="clear"
        size="small"
        [disabled]="!canIncrease(entry)"
        (click)="adjustEntry.emit({ entry, delta: 1 })">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
    </div>
  } @else {
    <ion-button
      fill="clear"
      size="small"
      color="medium"
      (click)="adjustEntry.emit({ entry, delta: -1 })">
      <ion-icon slot="icon-only" name="close-outline"></ion-icon>
    </ion-button>
  }
  ```

  Cuando `showEntryQuantity=false`, el botón × emite `adjustEntry({ entry, delta: -1 })`. En el fresh add modal, `adjustEntryById` lleva la quantity de 1 a 0 y elimina la entrada.

- [ ] **Step 3: Build check**

  ```bash
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/shared/components/entity-selector-modal/
  git commit -m "feat(entity-selector): add showEntryQuantity prop to hide quantity controls"
  ```

---

## Task 5: Fresh add modal — simplificación

**Files:**
- Modify: `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html`
- Modify: `src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts`

### 5a: Simplificar el template

- [ ] **Step 1: Reemplazar fresh-add-modal.component.html completamente**

  ```html
  <app-entity-selector-modal
    [isOpen]="state.isOpen()"
    [title]="'pantry.fresh.addModal.title' | translate"
    [cardTitle]="'pantry.fresh.addModal.cardTitle' | translate"
    [subtitle]="'pantry.fresh.addModal.subtitle' | translate"
    [placeholder]="'pantry.fresh.addModal.placeholder' | translate"
    [emptyLabel]="'pantry.fresh.addModal.noResults' | translate"
    [entriesEmptyLabel]="'pantry.fresh.addModal.empty' | translate"
    [saveLabel]="'pantry.fresh.addModal.submit' | translate"
    [saving]="state.isSubmitting()"
    [disableSave]="!state.hasEntries()"
    [items]="state.options()"
    [entries]="state.entryViewModels()"
    [showSecondaryInfo]="true"
    [showMeta]="false"
    [showEntryDate]="false"
    [showEntryQuantity]="false"
    [showAllOnFocus]="true"
    [autofocus]="true"
    [showEmptyAction]="state.showEmptyAction()"
    [showEmptyActionWhenNoExactMatch]="true"
    [emptyActionLabel]="state.emptyActionLabel()"
    (willDismiss)="state.dismiss()"
    (didDismiss)="state.close()"
    (selectItem)="state.addEntry($event)"
    (queryChange)="state.onQueryChange($event)"
    (emptyAction)="state.addEntryFromQuery($event)"
    (adjustEntry)="state.adjustEntryById($event.entry.id, $event.delta)"
    (save)="state.submit()">
  </app-entity-selector-modal>
  ```

  Cambios respecto al original:
  - `[showEntryDate]="false"` oculta el date picker por entrada.
  - `[showEntryQuantity]="false"` oculta los ± y muestra el botón ×.
  - Eliminados: `[showEntryNoExpiry]`, `(entryDateChange)`, `(entryNoExpiryToggle)`, y el `<div extras>` del toggle de keepInStock.
  - Se mantiene `(adjustEntry)` porque el botón × del entity-selector-modal lo usa para eliminar entradas.

### 5b: Limpiar el state service

- [ ] **Step 2: Eliminar código muerto de pantry-fresh-add-modal-state.service.ts**

  Eliminar:
  - La señal `readonly keepInStock = signal(false);` (~línea 29)
  - El método `toggleKeepInStock()` (~líneas 80-82)
  - El método `setEntryDate()` (~líneas 150-158)
  - El método `setEntryNoExpiry()` (~líneas 160-168)
  - La línea `this.keepInStock.set(false);` en `open()` (~línea 58)
  - La línea `this.keepInStock.set(false);` en `close()` (~línea 69)

  En `submit()`, reemplazar:
  ```typescript
  const minThreshold = this.keepInStock() ? 1 : undefined;
  ```
  por:
  ```typescript
  const minThreshold = undefined;
  ```

  Y en el bloque de item existente, reemplazar:
  ```typescript
  minThreshold: minThreshold ?? existing.minThreshold,
  ```
  por:
  ```typescript
  minThreshold: existing.minThreshold,
  ```

  Esto preserva el `minThreshold` de los items existentes y deja `undefined` en los nuevos (el usuario lo gestiona desde el edit modal).

- [ ] **Step 3: Build check**

  ```bash
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html \
          src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts
  git commit -m "feat(fresh): simplify add modal — remove quantity, date and keep-in-stock"
  ```

---

## Task 6: Fresh edit modal — UI rediseño con form-section cards

**Files:**
- Modify: `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.html`
- Modify: `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.scss`

### 6a: Restructurar el template

- [ ] **Step 1: Reemplazar fresh-edit-item-modal.component.html completamente**

  ```html
  <ion-modal
    [isOpen]="state.isOpen()"
    (willDismiss)="state.dismiss()"
    (didDismiss)="state.close()">
    <ng-template>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ 'pantry.fresh.editModal.title' | translate }}</ion-title>
          <ion-buttons slot="end">
            <ion-button fill="clear" color="medium" (click)="state.dismiss()">
              <ion-icon slot="icon-only" name="close"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding fresh-edit-modal">
        <form [formGroup]="state.form" class="fresh-edit-modal__form">

          <div class="form-section">
            <ion-item lines="none">
              <ion-input
                formControlName="name"
                label="{{ 'pantry.form.name' | translate }}"
                labelPlacement="stacked"
                [placeholder]="'pantry.form.namePlaceholder' | translate"
                required>
              </ion-input>
            </ion-item>
          </div>

          <div class="form-section-header">
            <h5>{{ 'pantry.fresh.editModal.stateLabel' | translate }}</h5>
          </div>
          <div class="form-section fresh-edit-modal__segment-card">
            <div class="fresh-edit-modal__segment" role="radiogroup">
              @for (s of state.states; track s) {
                <button
                  type="button"
                  role="radio"
                  class="fresh-edit-modal__segment-btn"
                  [class.is-active]="state.currentState() === s"
                  [attr.data-state]="s"
                  [attr.aria-checked]="state.currentState() === s ? 'true' : 'false'"
                  (click)="onStateClick(s)">
                  {{ labelKey(s) | translate }}
                </button>
              }
            </div>
          </div>

          <div class="form-section-header">
            <h5>{{ 'pantry.fresh.addModal.whenExpires' | translate }}</h5>
          </div>
          <div class="form-section fresh-edit-modal__date-card">
            <app-quick-date-chips
              [emphasizedKeys]="['today', 'twoDays']"
              (dateSelected)="onDateSelected($event)">
            </app-quick-date-chips>
          </div>

          <div class="form-section">
            <ion-item lines="none">
              <ion-label>
                <p class="fresh-edit-modal__keep-label">{{ 'pantry.fresh.keepInStock' | translate }}</p>
                <p class="fresh-edit-modal__keep-hint">{{ 'pantry.fresh.keepInStockHint' | translate }}</p>
              </ion-label>
              <ion-toggle
                slot="end"
                formControlName="keepInStock">
              </ion-toggle>
            </ion-item>
          </div>

        </form>

        <div class="fresh-edit-modal__danger-zone">
          <ion-button fill="outline" color="medium" (click)="state.convertToPantry()" [disabled]="state.isSaving()">
            {{ 'pantry.fresh.convertToPantry.button' | translate }}
          </ion-button>
          <ion-button fill="clear" color="danger" (click)="state.deleteItem()" [disabled]="state.isSaving()">
            <ion-icon slot="start" name="trash-outline"></ion-icon>
            {{ 'common.actions.delete' | translate }}
          </ion-button>
        </div>
      </ion-content>

      <ion-footer>
        <ion-toolbar>
          <ion-button
            expand="block"
            color="primary"
            [disabled]="!state.canSave() || state.isSaving()"
            (click)="state.save()">
            @if (state.isSaving()) {
              <ion-spinner name="dots"></ion-spinner>
            } @else {
              {{ 'common.actions.save' | translate }}
            }
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    </ng-template>
  </ion-modal>
  ```

### 6b: Actualizar los estilos SCSS

- [ ] **Step 2: Reemplazar fresh-edit-item-modal.component.scss completamente**

  ```scss
  .fresh-edit-modal {
    &__form {
      display: flex;
      flex-direction: column;
      gap: var(--app-theme-spacing-md);
      padding-top: var(--app-theme-spacing-md);
    }

    &__keep-label {
      font-size: var(--app-theme-font-size-body);
      font-weight: var(--app-theme-font-weight-bold);
      color: var(--app-theme-text-color);
      margin: 0 0 2px 0;
    }

    &__keep-hint {
      font-size: 0.75rem;
      color: var(--app-theme-text-muted);
      margin: 0;
      line-height: 1.4;
    }

    &__segment {
      display: inline-flex;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ion-color-primary) 6%, transparent);
      border: 1px solid color-mix(in srgb, var(--ion-color-primary) 14%, transparent);
      padding: 4px;
      gap: 4px;
      width: fit-content;
    }

    &__segment-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--app-theme-text-muted);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;

      &.is-active[data-state='sufficient'] {
        background: var(--app-theme-card-accent-success, var(--ion-color-success));
        color: var(--ion-color-success-contrast, white);
      }
      &.is-active[data-state='low'] {
        background: var(--app-theme-card-accent-warning, var(--ion-color-warning));
        color: var(--ion-color-dark);
      }
      &.is-active[data-state='none'] {
        background: var(--app-theme-card-accent-critical, var(--ion-color-medium));
        color: var(--ion-color-medium-contrast, white);
      }
    }

    &__segment-card {
      padding: 12px 16px;
    }

    &__date-card {
      padding: 12px 16px;
    }

    &__danger-zone {
      margin-top: var(--app-theme-spacing-lg);
      padding-top: var(--app-theme-spacing-md);
      border-top: 1px solid var(--app-theme-card-border-color);
      display: flex;
      flex-direction: column;
      gap: var(--app-theme-spacing-sm);
    }
  }

  // form-section pattern (same visual as pantry edit modal)
  .form-section {
    display: flex;
    flex-direction: column;
    padding: 10px 16px;
    gap: 0;
    border-radius: 16px;
    background: var(--ion-card-background);
    box-shadow: var(--ion-card-box-shadow, 0 10px 26px rgba(15, 20, 19, 0.18));
    border: 1px solid color-mix(in srgb, var(--ion-text-color) 12%, transparent);
    overflow: visible;

    ion-item {
      --background: transparent;
      --padding-start: 0;
      --inner-padding-end: 0;
    }
  }

  .form-section-header {
    display: flex;
    align-items: center;
    padding: 4px 2px 0;
    margin-top: 4px;

    h5 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
    }
  }
  ```

- [ ] **Step 3: Build check**

  ```bash
  npx ng build --configuration=development 2>&1 | tail -5
  ```

  Expected: sin errores.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/features/pantry/components/fresh-edit-item-modal/
  git commit -m "feat(fresh): redesign edit modal with form-section cards matching pantry style"
  ```

---

## Verificación final

- [ ] **Arrancar el servidor de desarrollo**

  ```bash
  npx ionic serve
  ```

- [ ] **Verificar Task 1**: Abrir la sección de frescos, añadir varios productos con nombres distintos — comprobar que aparecen en orden alfabético. Cambiar el estado de uno — comprobar que NO se mueve de posición.

- [ ] **Verificar Task 2**: En la sección despensa, comprobar que por defecto se muestra la lista plana (sin headers de categoría). Pulsar el botón de toggle (icono apps/list) — comprobar que aparece la vista agrupada por categoría. Volver a pulsar — vuelve a lista plana.

- [ ] **Verificar Task 3**: Con un fresco que tenga fecha de caducidad pasada: la card debe mostrar "Caducado" en rojo con barrita roja a la izquierda, y el segment de estado debe estar en gris desactivado (no se puede pulsar). Con fresco sin fecha: no aparece label. Con fresco con fecha futura: label normal como antes.

- [ ] **Verificar Task 4 + 5**: Abrir el modal de añadir fresco. Buscar y seleccionar un producto — debe aparecer en la lista solo con nombre y un botón ×. No debe haber date picker ni ajustador de cantidad. Pulsar × elimina la entrada. Pulsar Guardar añade el producto en estado Suficiente sin fecha.

- [ ] **Verificar Task 6**: Abrir el edit modal de un fresco. Comprobar que el input de nombre está dentro de una card blanca con sombra y que la barra inferior del input se ve completa (no cortada). Las secciones de estado, fecha y "Volver a comprar" deben estar en cards blancas separadas.
