# Fresh Products Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar la sección de Productos Frescos en un sistema coherente de 3 estados (Suficiente/Poco/Nada), con catálogos separados, modal de edición específico, conversión bidireccional fresh ⇄ pantry, y filtros unificados con la despensa.

**Architecture:** Mantener el modelo `PantryItem`/`ItemBatch` sin cambios. Los frescos son items con `productType === 'fresh'` y por convención exactamente 1 batch. Una nueva domain layer (`fresh.domain.ts`) encapsula el mapeo estado⇄cantidad y la consolidación al convertir. El bloque "Hoy" del dashboard pasa a competir frescos y despensa en el mismo pool con un factor de confianza para frescos. El usuario ha pedido **sin tests unitarios** en este cambio: la verificación es manual.

**Tech Stack:** Angular 20 (standalone, signals), Ionic 8, Capacitor 7, PouchDB, ngx-translate (es/en/de/fr/it/pt).

**Spec:** `docs/superpowers/specs/2026-04-27-fresh-products-redesign-design.md`

**Working branch:** `feat/fresh-products` (ya existente, no crear worktree).

---

## File Structure

### Archivos NUEVOS

| Path | Responsabilidad |
|---|---|
| `src/app/core/domain/pantry/fresh.domain.ts` | Funciones puras: mapeo estado⇄cantidad, consolidación de batches, preview de conversión |
| `src/app/core/services/pantry/modals/pantry-fresh-edit-modal-state.service.ts` | Estado del modal de editar fresco (form, save, convertir a despensa, eliminar) |
| `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.ts` | Component standalone para editar fresco |
| `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.html` | Template del modal |
| `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.scss` | Estilos |

### Archivos MODIFICADOS

| Path | Qué cambia |
|---|---|
| `src/app/core/domain/dashboard/dashboard.domain.ts` | Constantes nuevas (`FRESH_URGENCY_FACTOR`, `FRESH_OUT_BONUS`), scoring con factor para frescos, bonus para fresh+Nada+keepInStock, nuevos reasonKeys, firma sin `urgentFreshItems` |
| `src/app/core/services/dashboard/dashboard-state.service.ts` | Eliminar computed `urgentFreshItems`, simplificar llamada a `computeTodaySuggestion` |
| `src/app/core/services/pantry/pantry-state.service.ts` | `freshItems` desde `pantryItemsState` (filtrado), nuevos contadores `totalFreshCount`/`filteredFreshEmpty`, `setFreshState(item, state)` reemplazando `toggleFreshItem`, ruteo de edición a modal específico para frescos |
| `src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts` | Refactor a entity-selector-modal: usa `addEntries`, autocomplete filtrado a frescos, detecta existentes (sobrescribe lote único), logging en historial |
| `src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts` | `addOptions` filtra `productType !== 'fresh'`, `productType: 'pantry'` al crear nuevo item |
| `src/app/core/services/pantry/modals/pantry-edit-item-modal-state.service.ts` | Nuevo método `convertToFresh(item)` con preview dialog |
| `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html` | Reemplazar contenido por `<app-entity-selector-modal>` |
| `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.ts` | Imports y bindings al entity-selector-modal |
| `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.scss` | Eliminar estilos no usados |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.ts` | Segment de 3 botones; computa estado actual desde `qtyToFreshState` |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.html` | Reemplazar toggle binario por segment |
| `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.scss` | Estilos del segment |
| `src/app/features/pantry/components/edit-item-modal/edit-item-modal.component.html` | Botón "Convertir a fresco" (footer secundario) |
| `src/app/features/pantry/pantry.component.html` | Empty state corto cuando filtros dejan sin frescos; render del nuevo modal de edición; segment de 3 botones |
| `src/app/features/pantry/pantry.component.ts` | Inyectar y proveer servicio del nuevo modal; render del modal |
| `src/app/shared/components/quick-date-chips/quick-date-chips.component.ts` | Aumentar contraste de chips no-emphasized |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` | Eliminar claves muertas, añadir claves de estados, modal editar, conversión, empty state filtrado, freshOut |

---

## Convenciones del proyecto (referencia para el implementador)

- **Servicios `*StateService`**: facade pattern. La página inyecta uno como `facade`, y la plantilla consume signals (`facade.xxx()`).
- **Page-scoped services**: `@Injectable()` sin `providedIn`, listados en `providers[]` del componente página.
- **Root-scoped services**: `@Injectable({ providedIn: 'root' })`.
- **Domain layer (`core/domain/`)**: funciones puras sin Angular.
- **Signals everywhere**: nada de RxJS dentro del feature.
- **Commits**: mensaje en inglés con scope (`feat(pantry): …`, `fix(pantry): …`, `refactor(dashboard): …`).
- **i18n**: las 6 claves se cambian en bloque para no dejar idiomas huérfanos.

---

## Task 1: Crear domain layer `fresh.domain.ts`

**Files:**
- Create: `src/app/core/domain/pantry/fresh.domain.ts`
- Modify: `src/app/core/domain/pantry/index.ts` (añadir export)

- [ ] **Step 1.1: Crear el archivo `fresh.domain.ts` con constantes y helpers puros**

Crea `src/app/core/domain/pantry/fresh.domain.ts` con este contenido completo:

```ts
import type { ItemBatch, PantryItem } from '@core/models/pantry';

export const FRESH_QTY = { sufficient: 3, low: 1, none: 0 } as const;

export type FreshState = 'sufficient' | 'low' | 'none';

export function qtyToFreshState(qty: number): FreshState {
  if (qty >= FRESH_QTY.sufficient) return 'sufficient';
  if (qty >= FRESH_QTY.low) return 'low';
  return 'none';
}

export function freshStateToQty(state: FreshState): number {
  return FRESH_QTY[state];
}

/**
 * Devuelve la fecha de caducidad más cercana a hoy entre los lotes con fecha.
 * Si no hay ningún lote con fecha, devuelve undefined.
 */
function pickClosestExpiration(batches: ItemBatch[]): string | undefined {
  const now = Date.now();
  const dated = (batches ?? [])
    .map(b => b.expirationDate)
    .filter((d): d is string => !!d);
  if (!dated.length) return undefined;
  return dated
    .slice()
    .sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now))[0];
}

/**
 * Consolida n lotes de un producto de despensa en un único lote apto para un fresco.
 * - quantity: suma de cantidades, mapeada a FRESH_QTY (>=3 → 3, 1-2 → 1, 0 → 0).
 * - expirationDate: la más cercana a hoy.
 * - opened: true si cualquier lote estaba abierto.
 * - locationId: descartado.
 * - batchId: nuevo.
 */
export function consolidateBatchesForFresh(
  batches: ItemBatch[],
  newBatchId: string,
): ItemBatch {
  const total = (batches ?? []).reduce((sum, b) => sum + (b.quantity ?? 0), 0);
  const state = qtyToFreshState(total);
  const expirationDate = pickClosestExpiration(batches ?? []);
  const opened = (batches ?? []).some(b => !!b.opened);
  return {
    batchId: newBatchId,
    quantity: freshStateToQty(state),
    expirationDate,
    opened,
  };
}

export interface ConvertToFreshPreview {
  totalQty: number;
  resultingState: FreshState;
  resultingExpiration?: string;
  hadMultipleBatches: boolean;
  hadLocations: boolean;
  batchesCount: number;
}

export function buildConvertToFreshPreview(item: PantryItem): ConvertToFreshPreview {
  const batches = item.batches ?? [];
  const totalQty = batches.reduce((sum, b) => sum + (b.quantity ?? 0), 0);
  return {
    totalQty,
    resultingState: qtyToFreshState(totalQty),
    resultingExpiration: pickClosestExpiration(batches),
    hadMultipleBatches: batches.length > 1,
    hadLocations: batches.some(b => !!b.locationId),
    batchesCount: batches.length,
  };
}
```

- [ ] **Step 1.2: Re-exportar desde el barrel del domain**

Edita `src/app/core/domain/pantry/index.ts` para añadir la línea:

```ts
export * from './fresh.domain';
```

(Si el barrel no existe, comprueba con `ls src/app/core/domain/pantry/` qué archivos hay y añade el export en el barrel existente.)

- [ ] **Step 1.3: Verificar que compila**

Run: `npx ng build --configuration=development` (o `npm run build`).
Expected: build OK, sin errores de TS sobre los nuevos imports.

- [ ] **Step 1.4: Commit**

```bash
git add src/app/core/domain/pantry/fresh.domain.ts src/app/core/domain/pantry/index.ts
git commit -m "feat(domain): add fresh products domain helpers"
```

---

## Task 2: Refactor del scoring de "Hoy" en `dashboard.domain.ts`

**Files:**
- Modify: `src/app/core/domain/dashboard/dashboard.domain.ts`

- [ ] **Step 2.1: Añadir constantes nuevas y aplicar factor + bonus en scoring**

En `src/app/core/domain/dashboard/dashboard.domain.ts`, justo después de la constante `HOY_MIN_SCORE` (línea ~19), añade:

```ts
// Factor de confianza para fechas de frescos (estimativas, no impresas en envase).
export const FRESH_URGENCY_FACTOR = 0.7;

// Bonus de score cuando un fresco está agotado y el usuario lo marcó keep-in-stock.
// Es la única regla especial que tienen los frescos en el bloque HOY.
export const FRESH_OUT_BONUS = 80;
```

- [ ] **Step 2.2: Eliminar el bloque de auto-win por `urgentFreshItems`**

En la misma función `computeTodaySuggestion`, borra el bloque que hoy hace return inmediato cuando `urgentFreshItems` no está vacío (líneas 81-99 aprox). El parámetro `urgentFreshItems?` también se elimina de la firma.

La nueva firma queda:

```ts
export function computeTodaySuggestion(
  nearExpiryItems: PantryItem[],
  allItems: PantryItem[],
  skipId?: string,
): TodaySuggestion | null {
```

- [ ] **Step 2.3: Modificar `scoreItem` para aplicar factor y bonus**

Localiza la función interna `scoreItem` (línea 128 aprox). Reemplaza el cuerpo:

```ts
const scoreItem = (item: PantryItem): number => {
  const days  = getDaysToExpiry(item);
  const stock = getStock(item);
  const type  = item.foodType as FoodType;
  const isLowStock = stock <= getLowStockThreshold(type);
  const isFresh = item.productType === 'fresh';

  let urgency = getUrgencyScore(days);
  if (isLowStock)        urgency += 25;
  if (isFastMoving(type)) urgency += 10;
  if (isFresh)           urgency *= FRESH_URGENCY_FACTOR;

  let total = urgency + (HOY_FOOD_TYPE_SCORE[type] ?? 0);

  // Excepción: fresco agotado con keep-in-stock activo es señal genuina (te falta algo importante).
  const isFreshOut = isFresh && stock === 0 && (item.minThreshold ?? 0) >= 1;
  if (isFreshOut) total += FRESH_OUT_BONUS;

  return total;
};
```

- [ ] **Step 2.4: Ampliar el pool de candidatos para incluir frescos sin fecha en estado Nada+keepInStock**

Justo antes de la línea que filtra `nearExpiryItems` para construir `nearCandidates`, añade un pool adicional con los frescos agotados+keep-in-stock (que pueden no tener fecha y no entrarían por la vía normal):

```ts
const isFreshOutCandidate = (item: PantryItem): boolean =>
  item.productType === 'fresh'
  && getStock(item) === 0
  && (item.minThreshold ?? 0) >= 1;

const freshOutPool = allItems.filter(isFreshOutCandidate);
```

Modifica también las funciones de filtrado existentes (`hasStock`, `hasDatedBatch`, `isNotExpired`) que se aplican a `nearExpiryItems` y `allItems` para que el pool de `nearCandidates` incluya los `freshOutPool`. Concretamente, sustituye la construcción de `nearCandidates` por:

```ts
const candidatePool = [...new Map(
  [...nearExpiryItems, ...freshOutPool].map(i => [i._id, i]),
).values()];

const nearCandidates = candidatePool
  .filter(i => isFood(i))
  .filter(i => isFreshOutCandidate(i) || (hasStock(i) && hasDatedBatch(i) && isNotExpired(i)))
  .map(i => ({ item: i, score: scoreItem(i), days: getDaysToExpiry(i) }))
  .filter(({ score }) => score > 0)
  .sort(sortCandidates);
```

(El cambio asegura que los frescos agotados con keep-in-stock entran al pool incluso sin `expirationDate` y aunque su `stock === 0`.)

- [ ] **Step 2.5: Asignar nuevos `reasonKey` cuando el protagonista es un fresco**

Localiza la sección donde se calcula `reasonKey` (línea 188 aprox). Reemplaza:

```ts
const reasonKey =
  protagonistDays !== null && protagonistDays <= 2 ? 'dashboard.today.reason.expiringsoon' :
  protagonistDays !== null && protagonistDays <= 5 ? 'dashboard.today.reason.expirestoday' :
                                                     'dashboard.today.reason.expiringlater';
```

por:

```ts
const isFreshProtagonist = protagonist.productType === 'fresh';
const protagonistStock = getStock(protagonist);
const protagonistKeepInStock = (protagonist.minThreshold ?? 0) >= 1;

let reasonKey: string;
if (isFreshProtagonist && protagonistStock === 0 && protagonistKeepInStock) {
  reasonKey = 'dashboard.today.reason.freshOut';
} else if (isFreshProtagonist) {
  reasonKey = 'dashboard.today.reason.freshExpiring';
} else if (protagonistDays !== null && protagonistDays <= 2) {
  reasonKey = 'dashboard.today.reason.expiringsoon';
} else if (protagonistDays !== null && protagonistDays <= 5) {
  reasonKey = 'dashboard.today.reason.expirestoday';
} else {
  reasonKey = 'dashboard.today.reason.expiringlater';
}
```

- [ ] **Step 2.6: Verificar que compila**

Run: `npx ng build --configuration=development`
Expected: OK. Si hay errores en `dashboard-state.service.ts` por la firma cambiada, los arreglamos en la siguiente task.

- [ ] **Step 2.7: Commit**

```bash
git add src/app/core/domain/dashboard/dashboard.domain.ts
git commit -m "refactor(dashboard): score fresh items with confidence factor and out-of-stock bonus"
```

---

## Task 3: Limpieza en `dashboard-state.service.ts`

**Files:**
- Modify: `src/app/core/services/dashboard/dashboard-state.service.ts`

- [ ] **Step 3.1: Eliminar `urgentFreshItems` computed**

Borra el bloque del computed `urgentFreshItems` ([dashboard-state.service.ts:84-95](src/app/core/services/dashboard/dashboard-state.service.ts#L84-L95)) por completo.

- [ ] **Step 3.2: Simplificar la llamada a `computeTodaySuggestion`**

En `todaySuggestion` (línea 250 aprox), elimina el cuarto argumento. La llamada queda:

```ts
readonly todaySuggestion = computed((): TodaySuggestion | null => {
  const raw = computeTodaySuggestion(
    this.nearExpiryItems(),
    this.pantryItems(),
    this.lastProtagonistId(),
  );
  if (!raw) return null;
  if (this.dismissedTodayIds().has(raw.protagonist.id)) return null;
  return raw;
});
```

- [ ] **Step 3.3: Verificar que compila**

Run: `npx ng build --configuration=development`
Expected: OK.

- [ ] **Step 3.4: Commit**

```bash
git add src/app/core/services/dashboard/dashboard-state.service.ts
git commit -m "refactor(dashboard): drop urgentFreshItems, use unified scoring pool"
```

---

## Task 4: Bugs visibles del modal de añadir fresco (i18n key + título)

**Files:**
- Modify: `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json` (solo el título)

> Nota: la limpieza completa de i18n se hace en Task 16. Aquí solo arreglamos los bugs visibles que dependen de cambios de plantilla.

- [ ] **Step 4.1: Cambiar la clave `common.cancel` → `common.actions.cancel`**

En `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html` línea 8, sustituye:

```html
{{ 'common.cancel' | translate }}
```

por:

```html
{{ 'common.actions.cancel' | translate }}
```

- [ ] **Step 4.2: Acortar el título del modal**

En los 6 archivos de i18n (`src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`), localiza la clave `pantry.fresh.addModal.title` y cambia su valor:

| Idioma | Antes | Después |
|---|---|---|
| es | "Nuevo producto fresco" | "Nuevo fresco" |
| en | "New fresh product" | "New fresh" |
| de | "Neues frisches Produkt" | "Neuer Frischeartikel" |
| fr | "Nouveau produit frais" | "Nouveau frais" |
| it | "Nuovo prodotto fresco" | "Nuovo fresco" |
| pt | "Novo produto fresco" | "Novo fresco" |

(Si los textos actuales no coinciden exactamente, busca el equivalente con `grep -n "addModal" src/assets/i18n/{idioma}.json`.)

> El refactor más profundo del modal (Task 9 y 10) sustituirá el HTML por `entity-selector-modal`. Como no sabemos en qué orden se ejecutarán las tasks si se paralelizan, el cambio puntual de la clave `cancel` aquí es defensivo.

- [ ] **Step 4.3: Commit**

```bash
git add src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html src/assets/i18n
git commit -m "fix(pantry): wrong i18n key in fresh add modal cancel button and shorten title"
```

---

## Task 5: Mejor contraste de chips no-emphasized

**Files:**
- Modify: `src/app/shared/components/quick-date-chips/quick-date-chips.component.ts`

- [ ] **Step 5.1: Aumentar el contraste de los chips no-enfatizados**

En `quick-date-chips.component.ts`, en el bloque `styles: [...]`, los chips no-enfatizados ahora usan `--background: var(--app-theme-card-border-color)` que se confunde con disabled. Reemplaza el bloque de estilos por:

```scss
.quick-date-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  ion-chip {
    --background: color-mix(in srgb, var(--ion-color-primary) 6%, transparent);
    --color: var(--app-theme-text-color);
    border: 1px solid color-mix(in srgb, var(--ion-color-primary) 18%, transparent);
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.85;

    &.active {
      --background: var(--ion-color-primary);
      --color: var(--ion-color-primary-contrast);
      border-color: var(--ion-color-primary);
      opacity: 1;
    }

    &.chip--emphasized:not(.active) {
      --background: color-mix(in srgb, var(--ion-color-primary) 18%, transparent);
      --color: var(--ion-color-primary);
      font-weight: 600;
      opacity: 1;
    }
  }
}
```

- [ ] **Step 5.2: Verificar visualmente**

Run: `npm start` (o el comando habitual del proyecto). Abre la app, abre el modal de añadir fresco. Confirma que los chips "5 días", "1 semana", "2 semanas", "Sin fecha" no parecen disabled.

- [ ] **Step 5.3: Commit**

```bash
git add src/app/shared/components/quick-date-chips/quick-date-chips.component.ts
git commit -m "fix(shared): readable contrast for non-emphasized quick date chips"
```

---

## Task 6: Refactor de `FreshItemCardComponent` a segment de 3 estados

**Files:**
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.ts`
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.html`
- Modify: `src/app/features/pantry/components/fresh-item-card/fresh-item-card.component.scss`

- [ ] **Step 6.1: Reescribir el TS para emitir cambio de estado**

Reemplaza `fresh-item-card.component.ts` por:

```ts
import {
  ChangeDetectionStrategy, Component, EventEmitter,
  Input, OnChanges, Output, computed, signal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';
import { type FreshState, qtyToFreshState } from '@core/domain/pantry';

@Component({
  selector: 'app-fresh-item-card',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './fresh-item-card.component.html',
  styleUrls: ['./fresh-item-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshItemCardComponent implements OnChanges {
  @Input({ required: true }) item!: PantryItem;
  @Output() readonly stateChange = new EventEmitter<{ item: PantryItem; state: FreshState }>();
  @Output() readonly editRequested = new EventEmitter<PantryItem>();

  readonly currentState = signal<FreshState>('none');
  readonly daysToExpiry = signal<number | null>(null);
  readonly expiryUrgency = computed((): 'critical' | 'warning' | 'neutral' => {
    if (this.currentState() === 'none') return 'neutral';
    const d = this.daysToExpiry();
    if (d === null) return 'neutral';
    if (d <= 1) return 'critical';
    if (d <= 3) return 'warning';
    return 'neutral';
  });
  readonly expiryLabel = computed((): string => {
    if (this.currentState() === 'none') return '';
    const d = this.daysToExpiry();
    if (d === null) return '';
    if (d < 0) return 'pantry.fresh.card.expired';
    if (d === 0) return 'pantry.fresh.card.today';
    if (d === 1) return 'pantry.fresh.card.tomorrow';
    if (d <= 3) return 'pantry.fresh.card.soon';
    return '';
  });

  readonly states: readonly FreshState[] = ['sufficient', 'low', 'none'];

  ngOnChanges(): void {
    const batch = this.item.batches?.[0];
    const qty = batch?.quantity ?? 0;
    this.currentState.set(qtyToFreshState(qty));
    const dateStr = batch?.expirationDate;
    if (dateStr) {
      const days = Math.ceil((Date.parse(dateStr) - Date.now()) / 86_400_000);
      this.daysToExpiry.set(days);
    } else {
      this.daysToExpiry.set(null);
    }
  }

  onStateSelected(state: FreshState): void {
    if (state === this.currentState()) return; // idempotente
    this.stateChange.emit({ item: this.item, state });
  }

  onEdit(): void {
    this.editRequested.emit(this.item);
  }

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }
}
```

- [ ] **Step 6.2: Reescribir el HTML con segment de 3 botones**

Reemplaza `fresh-item-card.component.html` por:

```html
<div class="fresh-item-card">
  <div class="fresh-item-card__info" role="button" (click)="onEdit()">
    <span class="fresh-item-card__name">{{ item.name }}</span>
    @if (expiryLabel()) {
      <span class="fresh-item-card__expiry" [attr.data-urgency]="expiryUrgency()">
        {{ expiryLabel() | translate }}
      </span>
    }
  </div>

  <div class="fresh-item-card__segment" role="radiogroup" [attr.aria-label]="('pantry.fresh.state.label' | translate)">
    @for (state of states; track state) {
      <button
        type="button"
        role="radio"
        class="fresh-item-card__segment-btn"
        [class.is-active]="currentState() === state"
        [attr.data-state]="state"
        [attr.aria-checked]="currentState() === state"
        [attr.aria-label]="(labelKey(state) | translate)"
        (click)="onStateSelected(state)">
        {{ labelKey(state) | translate }}
      </button>
    }
  </div>
</div>
```

- [ ] **Step 6.3: Estilos del segment**

Reemplaza `fresh-item-card.component.scss` por:

```scss
.fresh-item-card {
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-md);
  padding: 8px var(--app-theme-spacing-md);
  border-radius: var(--app-theme-card-border-radius);
  background: var(--app-theme-card-bg);
  border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);

  &__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    cursor: pointer;
  }

  &__name {
    font-size: var(--app-theme-font-size-body);
    font-weight: var(--app-theme-font-weight-bold);
    color: var(--app-theme-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__expiry {
    font-size: 0.75rem;
    color: var(--app-theme-text-muted);

    &[data-urgency='critical'] { color: var(--app-theme-card-accent-critical); font-weight: 600; }
    &[data-urgency='warning']  { color: var(--app-theme-card-accent-warning);  font-weight: 600; }
  }

  &__segment {
    display: inline-flex;
    flex-shrink: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ion-color-primary) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--ion-color-primary) 14%, transparent);
    padding: 2px;
    gap: 2px;
  }

  &__segment-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--app-theme-text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    min-width: 52px;
    text-transform: capitalize;

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

    &:not(.is-active):active {
      background: color-mix(in srgb, var(--ion-color-primary) 14%, transparent);
    }
  }
}
```

> Nota: el componente ya no importa `IonIcon` — eliminar de `imports` (ya hecho en Step 6.1).

- [ ] **Step 6.4: Verificar build**

Run: `npx ng build --configuration=development`
Expected: build OK. Tendrá warnings/errores en pantry-state porque `toggled` ya no existe — los arregla la Task 7.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/features/pantry/components/fresh-item-card
git commit -m "feat(pantry): replace fresh card binary toggle with 3-state segment"
```

---

## Task 7: Refactor de `pantry-state.service.ts` para frescos

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`

- [ ] **Step 7.1: Importar el domain helper**

En la cabecera del archivo añade:

```ts
import { type FreshState, freshStateToQty, qtyToFreshState } from '@core/domain/pantry';
```

- [ ] **Step 7.2: Cambiar la fuente de `freshItems` a `pantryItemsState` (filtrado)**

Localiza el computed `freshItems` (línea 97 aprox). Reemplaza por:

```ts
readonly freshItems = computed(() =>
  this.pantryItemsState()
    .filter(i => i.productType === 'fresh')
    .sort((a, b) => {
      const aQty = a.batches?.[0]?.quantity ?? 0;
      const bQty = b.batches?.[0]?.quantity ?? 0;
      if (aQty !== bQty) return bQty - aQty;
      const aDate = a.batches?.[0]?.expirationDate;
      const bDate = b.batches?.[0]?.expirationDate;
      if (aDate && bDate) return Date.parse(aDate) - Date.parse(bDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return 0;
    })
);
```

- [ ] **Step 7.3: Añadir contadores para distinguir empty states**

Justo debajo del computed `freshItems`, añade:

```ts
/** Total de frescos en el dataset crudo, sin filtrar. */
readonly totalFreshCount = computed(() =>
  this.pantryStore.loadedProducts().filter(i => i.productType === 'fresh').length,
);

/** True si hay frescos creados pero los filtros activos los esconden todos. */
readonly hasFreshButFilteredEmpty = computed(() =>
  this.totalFreshCount() > 0 && this.freshItems().length === 0,
);

/** True si no hay ningún fresco en absoluto (empty state de onboarding). */
readonly hasNoFreshAtAll = computed(() => this.totalFreshCount() === 0);
```

- [ ] **Step 7.4: Reemplazar `toggleFreshItem` por `setFreshState`**

Localiza el método `toggleFreshItem` (línea 372 aprox). Reemplaza la firma y cuerpo por:

```ts
async setFreshState(item: PantryItem, state: FreshState): Promise<void> {
  const newQty = freshStateToQty(state);
  const currentBatches = item.batches ?? [];
  // Convención: un fresco tiene exactamente 1 lote. Defensivamente, si llegan más,
  // actualizamos el primero y conservamos los demás intactos.
  const updatedBatches = currentBatches.length > 0
    ? [{ ...currentBatches[0], quantity: newQty }, ...currentBatches.slice(1)]
    : [{ batchId: `batch-${Date.now()}`, quantity: newQty }];

  await this.pantryStore.updateItem({ ...item, batches: updatedBatches });

  const msgKey = state === 'none'
    ? 'pantry.fresh.toast.markedOut'
    : 'pantry.fresh.toast.updated';
  const toast = await this.toastCtrl.create({
    message: this.translate.instant(msgKey),
    duration: 1200,
    position: 'bottom',
  });
  await toast.present();
}
```

> Borra completamente el método anterior `toggleFreshItem`.

- [ ] **Step 7.5: Mantener `openFreshAddModal` y `toggleShowAllFresh` sin cambios**

(No los toques en este task — siguen igual.)

- [ ] **Step 7.6: Verificar build**

Run: `npx ng build --configuration=development`
Expected: build OK salvo errores en `pantry.component.html` que aún llama a `facade.toggleFreshItem`. Lo arreglamos en la siguiente task.

- [ ] **Step 7.7: Commit**

```bash
git add src/app/core/services/pantry/pantry-state.service.ts
git commit -m "refactor(pantry): drive freshItems from filtered state and replace toggle with setFreshState"
```

---

## Task 8: Wiring del segment en `pantry.component.html` y empty states

**Files:**
- Modify: `src/app/features/pantry/pantry.component.html`
- Modify: `src/app/features/pantry/pantry.component.scss`

- [ ] **Step 8.1: Conectar el evento `stateChange` y separar empty states**

Localiza la sección Frescos en `pantry.component.html` (líneas 58-95 aprox). Reemplaza el bloque por:

```html
<!-- FRESCOS SECTION -->
<section class="pantry-section pantry-section--fresh">
  <header class="pantry-section__header">
    <h3 class="pantry-section__title">{{ 'pantry.sections.fresh' | translate }}</h3>
    <button class="pantry-section__add-btn" [attr.aria-label]="'pantry.fresh.addButton' | translate" (click)="facade.openFreshAddModal()">
      <ion-icon name="add-outline"></ion-icon>
    </button>
  </header>

  @if (facade.hasNoFreshAtAll()) {
    <div class="fresh-empty-state">
      <p class="fresh-empty-state__title">{{ 'pantry.fresh.emptyState.title' | translate }}</p>
      <p class="fresh-empty-state__subtitle">{{ 'pantry.fresh.emptyState.subtitle' | translate }}</p>
      <button class="fresh-empty-state__cta" (click)="facade.openFreshAddModal()">
        {{ 'pantry.fresh.emptyState.cta' | translate }}
      </button>
    </div>
  } @else if (facade.hasFreshButFilteredEmpty()) {
    <div class="fresh-empty-state fresh-empty-state--filtered">
      <p class="fresh-empty-state__subtitle">{{ 'pantry.fresh.empty.filters' | translate }}</p>
    </div>
  } @else {
    <div class="fresh-list">
      @for (item of facade.visibleFreshItems(); track item._id) {
        <app-fresh-item-card
          [item]="item"
          (stateChange)="facade.setFreshState($event.item, $event.state)"
          (editRequested)="facade.openEditModalFromSheet($event)">
        </app-fresh-item-card>
      }
    </div>
    @if (facade.freshItems().length > 4) {
      <button type="button" class="fresh-show-more" (click)="facade.toggleShowAllFresh()">
        @if (!facade.showAllFresh()) {
          {{ 'pantry.fresh.showMore' | translate:{ count: facade.freshItems().length } }}
        } @else {
          {{ 'pantry.fresh.showLess' | translate }}
        }
      </button>
    }
  }
</section>
```

- [ ] **Step 8.2: Añadir estilos del empty filtrado**

En `pantry.component.scss`, justo después del bloque `.fresh-empty-state { ... }` (línea 491), añade:

```scss
.fresh-empty-state--filtered {
  padding: var(--app-theme-spacing-sm) var(--app-theme-card-margin-inline);

  .fresh-empty-state__subtitle {
    font-style: italic;
  }
}
```

- [ ] **Step 8.3: Verificar build y arrancar la app**

Run: `npx ng build --configuration=development`
Expected: OK.

Run: `npm start` y verifica:
- Lista de frescos: ahora se ve el segment de 3 botones, tap cambia el estado.
- Filtra "Caducados" → si los frescos no caducan, debería verse el empty state corto ("Ningún fresco coincide…", aunque la clave i18n aún no esté → muestra la key).
- Empty state de onboarding aparece solo si no tienes frescos.

- [ ] **Step 8.4: Commit**

```bash
git add src/app/features/pantry/pantry.component.html src/app/features/pantry/pantry.component.scss
git commit -m "feat(pantry): segment-driven fresh card and split empty states"
```

---

## Task 9: Refactor `PantryFreshAddModalStateService` a entity selector

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts`

- [ ] **Step 9.1: Reescribir el servicio completo con entity-selector pattern**

Reemplaza `pantry-fresh-add-modal-state.service.ts` por:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { buildAddItemPayload } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, createDocumentId, withSignalFlag } from '@core/utils';
import { dedupeByNormalizedKey, formatFriendlyName, normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LanguageService } from '../../shared/language.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * Estado del modal de añadir fresco. Idéntico patrón que PantryAddModalStateService,
 * pero el catálogo se filtra a productType === 'fresh' y la submission convierte
 * cantidades en estado "Suficiente" (qty=3) por defecto.
 */
@Injectable()
export class PantryFreshAddModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly query = signal('');
  readonly entries = signal<AddEntry[]>([]);
  readonly keepInStock = signal(false);

  readonly entryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.entries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      isNew: entry.isNew,
      expirationDate: entry.expirationDate,
      noExpiry: entry.noExpiry,
    }))
  );

  readonly hasEntries = computed(() => this.entries().length > 0);

  readonly options = computed(() => this.buildOptions(this.pantryStore.loadedProducts(), this.entries()));

  readonly showEmptyAction = computed(() => normalizeTrim(this.query()).length >= 1);

  readonly emptyActionLabel = computed(() => {
    const name = normalizeTrim(this.query());
    if (!name) return '';
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });

  open(): void {
    this.entries.set([]);
    this.query.set('');
    this.keepInStock.set(false);
    this.isOpen.set(true);
    this.isSubmitting.set(false);
  }

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.isSubmitting.set(false);
    this.entries.set([]);
    this.query.set('');
    this.keepInStock.set(false);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  onQueryChange(value: string): void {
    this.query.set(value ?? '');
  }

  toggleKeepInStock(): void {
    this.keepInStock.update(v => !v);
  }

  /** Selección de un item existente desde el autocomplete. */
  addEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) return;
    this.entries.update(current => {
      const idx = current.findIndex(e => e.item?._id === item._id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = { ...next[idx], quantity: Math.max(0, next[idx].quantity + 1) };
        return next;
      }
      return [
        ...current,
        { id: `fresh:${item._id}`, name: option.title, quantity: 1, item, isNew: false },
      ];
    });
    this.query.set('');
  }

  addEntryFromQuery(name?: string): void {
    const next = normalizeTrim(name ?? this.query());
    if (!next) return;
    const normalized = normalizeLowercase(next);
    // Solo busca contra el catálogo de frescos (no merges con un item de despensa con el mismo nombre).
    const match = this.pantryStore
      .loadedProducts()
      .find(i => i.productType === 'fresh' && normalizeLowercase(i.name) === normalized);

    if (match) {
      this.addEntry({ id: match._id, title: match.name, raw: match });
      return;
    }

    const formatted = formatFriendlyName(next, next);
    this.entries.update(current => {
      const idx = current.findIndex(e => normalizeLowercase(e.name) === normalized);
      if (idx >= 0) {
        const nextArr = [...current];
        nextArr[idx] = { ...nextArr[idx], quantity: Math.max(0, nextArr[idx].quantity + 1) };
        return nextArr;
      }
      return [
        ...current,
        { id: `fresh:new:${normalized}`, name: formatted, quantity: 1, isNew: true },
      ];
    });
    this.query.set('');
  }

  adjustEntryById(entryId: string, delta: number): void {
    const d = Number.isFinite(delta) ? delta : 0;
    if (!d) return;
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      const updated = { ...next[idx], quantity: Math.max(0, next[idx].quantity + d) };
      if (updated.quantity <= 0) {
        next.splice(idx, 1);
        return next;
      }
      next[idx] = updated;
      return next;
    });
  }

  setEntryDate(entryId: string, date: string | undefined): void {
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      next[idx] = { ...next[idx], expirationDate: date || undefined, noExpiry: date ? undefined : next[idx].noExpiry };
      return next;
    });
  }

  setEntryNoExpiry(entryId: string): void {
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      const toggled = !next[idx].noExpiry;
      next[idx] = { ...next[idx], noExpiry: toggled || undefined, expirationDate: toggled ? undefined : next[idx].expirationDate };
      return next;
    });
  }

  /**
   * Submission. Cada entry se materializa así:
   * - isNew → crea PantryItem con productType='fresh', batch único qty=3 (Suficiente),
   *           expirationDate del entry, minThreshold=1 si keepInStock global está activo.
   * - existing → sobrescribe el batch único del fresco (qty=3, fecha si proporcionada).
   *              Esto preserva la convención "fresco = 1 lote" en lugar de añadir nuevos lotes.
   */
  async submit(): Promise<void> {
    if (this.isSubmitting()) return;
    const entries = this.entries().filter(e => e.quantity > 0);
    if (!entries.length) return;

    await withSignalFlag(this.isSubmitting, async () => {
      const sessionId = entries.length > 1 ? createDocumentId('session') : undefined;
      const minThreshold = this.keepInStock() ? 1 : undefined;

      for (const entry of entries) {
        const timestamp = new Date().toISOString();

        if (entry.isNew || !entry.item) {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: 3, // Suficiente
            expirationDate: entry.expirationDate,
            noExpiry: entry.noExpiry,
          });
          const freshItem: PantryItem = {
            ...base,
            productType: 'fresh',
            minThreshold,
            isBasic: false,
          };
          await this.pantryStore.addItem(freshItem);
          await this.eventManager.logAddNewItem(freshItem, 3, sessionId, timestamp);
          continue;
        }

        // Existente: sobrescribe el batch único.
        const existing = entry.item;
        const previousBatch = existing.batches?.[0];
        const updatedBatch = {
          batchId: previousBatch?.batchId ?? `batch-${Date.now()}`,
          quantity: 3,
          expirationDate: entry.expirationDate ?? previousBatch?.expirationDate,
          noExpiry: entry.noExpiry ?? previousBatch?.noExpiry,
          opened: previousBatch?.opened,
          locationId: previousBatch?.locationId,
        };
        const updated: PantryItem = {
          ...existing,
          batches: [updatedBatch],
          minThreshold: minThreshold ?? existing.minThreshold,
          updatedAt: timestamp,
        };
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAddExistingItem(existing, updated, 3, entry.expirationDate, sessionId, timestamp);
      }
      this.dismiss();
    }).catch(err => console.error('[PantryFreshAddModalStateService] submit error', err));
  }

  private buildOptions(items: PantryItem[], entries: AddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, e => e.name);
    const excluded = new Set(uniqueEntries.map(e => e.item?._id).filter(Boolean) as string[]);
    // Filtramos a SOLO frescos antes de pasar al autocomplete.
    const onlyFresh = items.filter(i => i.productType === 'fresh');
    return buildPantryItemAutocomplete(onlyFresh, {
      locale,
      excludeIds: excluded,
      getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
    });
  }
}
```

- [ ] **Step 9.2: Verificar build**

Run: `npx ng build --configuration=development`
Expected: errores en `pantry-state.service.ts` (ya no expone los signals viejos del fresh modal) y en el HTML del fresh-add-modal (que aún apunta a APIs viejas). Las dos siguientes tasks lo cierran.

- [ ] **Step 9.3: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts
git commit -m "refactor(pantry): fresh add modal state uses entity-selector pattern with fresh-only catalog"
```

---

## Task 10: Reescribir `FreshAddModalComponent` template y component

**Files:**
- Modify: `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html`
- Modify: `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.ts`
- Modify: `src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.scss`

- [ ] **Step 10.1: HTML usa `entity-selector-modal`**

Reemplaza `fresh-add-modal.component.html` por:

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
  [showEntryNoExpiry]="true"
  (entryDateChange)="state.setEntryDate($event.entry.id, $event.date)"
  (entryNoExpiryToggle)="state.setEntryNoExpiry($event.entry.id)"
  (save)="state.submit()">

  <div extras class="fresh-add-modal__keep">
    <ion-item lines="none" class="fresh-add-modal__keep-item">
      <ion-label>
        <p class="fresh-add-modal__keep-label">{{ 'pantry.fresh.keepInStock' | translate }}</p>
        <p class="fresh-add-modal__keep-hint">{{ 'pantry.fresh.keepInStockHint' | translate }}</p>
      </ion-label>
      <ion-toggle
        slot="end"
        [checked]="state.keepInStock()"
        (ionChange)="state.toggleKeepInStock()">
      </ion-toggle>
    </ion-item>
  </div>
</app-entity-selector-modal>
```

> **Nota:** el slot `extras` asume que `entity-selector-modal` tiene un `<ng-content select="[extras]">` reservado para contenido adicional. **Verifica primero** abriendo `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.html` y busca un `<ng-content select="[extras]">`. Si NO existe, añádelo justo después del bloque de entries (entre la lista de entries y el footer). Si la convención es otra (`<ng-content></ng-content>` sin selector, o un slot por nombre distinto), úsala. Comprométete inicialmente sin el toggle si la integración del slot requiere modificar entity-selector-modal — Task 10.4 aborda este detalle.

- [ ] **Step 10.2: TS del component minimal**

Reemplaza `fresh-add-modal.component.ts` por:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonItem, IonLabel, IonToggle } from '@ionic/angular/standalone';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';

@Component({
  selector: 'app-fresh-add-modal',
  standalone: true,
  imports: [EntitySelectorModalComponent, IonItem, IonLabel, IonToggle, TranslateModule],
  templateUrl: './fresh-add-modal.component.html',
  styleUrls: ['./fresh-add-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshAddModalComponent {
  readonly state = inject(PantryFreshAddModalStateService);
}
```

- [ ] **Step 10.3: Limpiar `.scss`**

Reemplaza el contenido de `fresh-add-modal.component.scss` por:

```scss
.fresh-add-modal {
  &__keep {
    padding: 0 16px 12px;
  }

  &__keep-item {
    --background: var(--app-theme-card-bg);
    --border-radius: var(--app-theme-card-border-radius);
    border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);
    border-radius: var(--app-theme-card-border-radius);
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
}
```

- [ ] **Step 10.4: Si `entity-selector-modal` no acepta el slot `extras`, añadirlo**

Abre `src/app/shared/components/entity-selector-modal/entity-selector-modal.component.html`. Si NO contiene `<ng-content select="[extras]">`, edita el archivo y añade ese slot justo antes del footer/save area (busca el `<ion-footer>` y mete el `<ng-content>` arriba).

Ejemplo (a añadir si no existe):

```html
<div class="entity-selector-modal__extras">
  <ng-content select="[extras]"></ng-content>
</div>
```

- [ ] **Step 10.5: Verificar build y comportamiento**

Run: `npx ng build --configuration=development`
Expected: build OK.

Run: `npm start` y comprueba:
- Modal de añadir fresco abre con autocomplete enfocado.
- Al teclear "Yog…" muestra solo el item "Yogures" si ya existe; si no, ofrece crear.
- Al añadir, se crea con `productType='fresh'` y `quantity=3`.
- Si lo añades dos veces seguidas para el mismo nombre → no se duplica, sobrescribe el lote.
- Toggle "Volver a comprar" funciona y persiste como `minThreshold=1`.

- [ ] **Step 10.6: Commit**

```bash
git add src/app/features/pantry/components/fresh-add-modal src/app/shared/components/entity-selector-modal
git commit -m "feat(pantry): fresh add modal uses entity-selector-modal"
```

---

## Task 11: Filtrar el modal de añadir despensa para excluir frescos

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts`

- [ ] **Step 11.1: Excluir frescos del autocomplete**

En `pantry-add-modal-state.service.ts`, dentro del método privado `buildAddOptions` (línea 282 aprox), filtra los items por `productType !== 'fresh'`:

```ts
private buildAddOptions(items: PantryItem[], entries: AddEntry[]): AutocompleteItem<PantryItem>[] {
  const locale = this.languageService.getCurrentLocale();
  const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
  const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
  // Items legacy sin productType caen como despensa por convención.
  const nonFresh = items.filter(item => item.productType !== 'fresh');
  return buildPantryItemAutocomplete(nonFresh, {
    locale,
    excludeIds: excluded,
    getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
  });
}
```

- [ ] **Step 11.2: Excluir matching de frescos en `addEntryFromQuery`**

Localiza `addEntryFromQuery` y modifica el `find` para que solo matchee items NO-fresh:

```ts
const matchingItem = this.pantryStore
  .loadedProducts()
  .find(item => item.productType !== 'fresh' && normalizeLowercase(item.name) === normalized);
```

- [ ] **Step 11.3: Asignar `productType: 'pantry'` al crear item nuevo**

En `submitAdd` (línea 91 aprox), cuando entra en la rama `entry.isNew || !entry.item`, asegúrate de que el item creado tenga `productType: 'pantry'`. Modifica:

```ts
if (entry.isNew || !entry.item) {
  const base = buildAddItemPayload({
    id: createDocumentId('item'),
    nowIso: timestamp,
    name: entry.name,
    quantity: entry.quantity,
    expirationDate: entry.expirationDate,
    noExpiry: entry.noExpiry,
  });
  const item: PantryItem = { ...base, productType: 'pantry' };
  await this.pantryStore.addItem(item);
  await this.eventManager.logAddNewItem(item, entry.quantity, sessionId, timestamp);
  continue;
}
```

- [ ] **Step 11.4: Verificar build**

Run: `npx ng build --configuration=development`
Expected: OK.

- [ ] **Step 11.5: Verificar manualmente**

Run: `npm start`. En el modal de añadir despensa, busca "Yogures" (que es fresco). No debería aparecer en sugerencias. Crear "Yogures" desde aquí debería crearlo como pantry, no fresco.

- [ ] **Step 11.6: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts
git commit -m "feat(pantry): exclude fresh products from pantry add modal catalog"
```

---

## Task 12: Crear `PantryFreshEditModalStateService`

**Files:**
- Create: `src/app/core/services/pantry/modals/pantry-fresh-edit-modal-state.service.ts`

- [ ] **Step 12.1: Crear el servicio**

Crea el archivo con este contenido:

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { type FreshState, freshStateToQty, qtyToFreshState } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import { normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { ToastController } from '@ionic/angular';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { PantryStateService } from '../pantry-state.service';
import { PantryStoreService } from '../pantry-store.service';

@Injectable()
export class PantryFreshEditModalStateService {
  private readonly fb = inject(FormBuilder);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly listState = inject(PantryStateService);
  private readonly translate = inject(TranslateService);
  private readonly toastCtrl = inject(ToastController);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);
  readonly currentState = signal<FreshState>('none');
  readonly states: readonly FreshState[] = ['sufficient', 'low', 'none'];

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    expirationDate: this.fb.control<string | null>(null),
    keepInStock: this.fb.control(false, { nonNullable: true }),
  });

  readonly canSave = computed(() => {
    const item = this.editingItem();
    return !!item && this.form.valid;
  });

  constructor() {
    effect(() => {
      const request = this.listState.editFreshItemModalRequest();
      if (!request) return;
      this.openEdit(request.item);
      this.listState.clearEditFreshItemModalRequest();
    });
  }

  openEdit(item: PantryItem): void {
    if (item.productType !== 'fresh') {
      console.warn('[PantryFreshEditModal] non-fresh item passed; ignoring');
      return;
    }
    this.editingItem.set(item);
    const batch = item.batches?.[0];
    this.currentState.set(qtyToFreshState(batch?.quantity ?? 0));
    this.form.reset({
      name: item.name ?? '',
      expirationDate: batch?.expirationDate ?? null,
      keepInStock: (item.minThreshold ?? 0) >= 1,
    });
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  close(): void {
    if (this.isOpen()) return;
    this.editingItem.set(null);
    this.isSaving.set(false);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  setState(state: FreshState): void {
    this.currentState.set(state);
  }

  setExpirationDate(date: string | null): void {
    this.form.get('expirationDate')?.setValue(date);
  }

  async save(): Promise<void> {
    const existing = this.editingItem();
    if (!existing || this.form.invalid || this.isSaving()) return;

    this.isSaving.set(true);
    try {
      const { name, expirationDate, keepInStock } = this.form.value;
      const previousBatch = existing.batches?.[0];
      const updatedBatch = {
        batchId: previousBatch?.batchId ?? `batch-${Date.now()}`,
        quantity: freshStateToQty(this.currentState()),
        expirationDate: expirationDate ?? undefined,
        noExpiry: previousBatch?.noExpiry,
        opened: previousBatch?.opened,
        locationId: previousBatch?.locationId,
      };
      const updated: PantryItem = {
        ...existing,
        name: normalizeTrim(name ?? existing.name),
        batches: [updatedBatch],
        minThreshold: keepInStock ? 1 : undefined,
        updatedAt: new Date().toISOString(),
      };
      await this.pantryStore.updateItem(updated);
      await this.eventManager.logAdvancedEdit(existing, updated);
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] save error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Convierte el fresco actual a producto de despensa y cierra el modal. */
  async convertToPantry(): Promise<void> {
    const existing = this.editingItem();
    if (!existing) return;
    this.isSaving.set(true);
    try {
      const updated: PantryItem = {
        ...existing,
        productType: 'pantry',
        updatedAt: new Date().toISOString(),
      };
      await this.pantryStore.updateItem(updated);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('pantry.fresh.convertToPantry.toast'),
        duration: 1500,
        position: 'bottom',
      });
      await toast.present();
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] convertToPantry error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteItem(): Promise<void> {
    const existing = this.editingItem();
    if (!existing) return;
    this.isSaving.set(true);
    try {
      await this.pantryStore.deleteItem(existing._id);
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] deleteItem error', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
```

- [ ] **Step 12.2: Verificar build**

Run: `npx ng build --configuration=development`
Expected: error en `PantryStateService` porque `editFreshItemModalRequest` y `clearEditFreshItemModalRequest` aún no existen. Lo añadimos en Task 14.

- [ ] **Step 12.3: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-fresh-edit-modal-state.service.ts
git commit -m "feat(pantry): add fresh edit modal state service"
```

---

## Task 13: Crear `FreshEditItemModalComponent`

**Files:**
- Create: `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.ts`
- Create: `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.html`
- Create: `src/app/features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.scss`

- [ ] **Step 13.1: Crear el TS**

Crea `fresh-edit-item-modal.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader,
  IonIcon, IonInput, IonItem, IonLabel, IonModal, IonSpinner,
  IonTitle, IonToggle, IonToolbar,
} from '@ionic/angular/standalone';
import { QuickDateChipsComponent } from '@shared/components/quick-date-chips/quick-date-chips.component';
import { PantryFreshEditModalStateService } from '@core/services/pantry/modals/pantry-fresh-edit-modal-state.service';
import type { FreshState } from '@core/domain/pantry';

@Component({
  selector: 'app-fresh-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule,
    IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonInput, IonLabel, IonToggle, IonIcon,
    IonFooter, IonSpinner, QuickDateChipsComponent,
  ],
  templateUrl: './fresh-edit-item-modal.component.html',
  styleUrls: ['./fresh-edit-item-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryFreshEditModalStateService],
})
export class FreshEditItemModalComponent {
  readonly state = inject(PantryFreshEditModalStateService);
  @ViewChild(QuickDateChipsComponent) readonly dateChips?: QuickDateChipsComponent;

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }

  onStateClick(state: FreshState): void {
    this.state.setState(state);
  }

  onDateSelected(date: string | null): void {
    this.state.setExpirationDate(date);
  }
}
```

- [ ] **Step 13.2: Crear el HTML**

Crea `fresh-edit-item-modal.component.html`:

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

        <ion-item lines="none" class="fresh-edit-modal__row">
          <ion-input
            formControlName="name"
            label="{{ 'pantry.form.name' | translate }}"
            labelPlacement="stacked"
            [placeholder]="'pantry.form.namePlaceholder' | translate"
            required>
          </ion-input>
        </ion-item>

        <div class="fresh-edit-modal__section">
          <p class="fresh-edit-modal__section-label">{{ 'pantry.fresh.editModal.stateLabel' | translate }}</p>
          <div class="fresh-edit-modal__segment" role="radiogroup">
            @for (s of state.states; track s) {
              <button
                type="button"
                role="radio"
                class="fresh-edit-modal__segment-btn"
                [class.is-active]="state.currentState() === s"
                [attr.data-state]="s"
                [attr.aria-checked]="state.currentState() === s"
                (click)="onStateClick(s)">
                {{ labelKey(s) | translate }}
              </button>
            }
          </div>
        </div>

        <div class="fresh-edit-modal__section">
          <p class="fresh-edit-modal__section-label">{{ 'pantry.fresh.addModal.whenExpires' | translate }}</p>
          <app-quick-date-chips
            [emphasizedKeys]="['today', 'twoDays']"
            (dateSelected)="onDateSelected($event)">
          </app-quick-date-chips>
        </div>

        <ion-item lines="none" class="fresh-edit-modal__row">
          <ion-label>
            <p class="fresh-edit-modal__keep-label">{{ 'pantry.fresh.keepInStock' | translate }}</p>
            <p class="fresh-edit-modal__keep-hint">{{ 'pantry.fresh.keepInStockHint' | translate }}</p>
          </ion-label>
          <ion-toggle
            slot="end"
            formControlName="keepInStock">
          </ion-toggle>
        </ion-item>

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

- [ ] **Step 13.3: Crear el SCSS**

Crea `fresh-edit-item-modal.component.scss`:

```scss
.fresh-edit-modal {
  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--app-theme-spacing-lg);
    padding-top: var(--app-theme-spacing-md);
  }

  &__row {
    --background: var(--app-theme-card-bg);
    --border-radius: var(--app-theme-card-border-radius);
    border: var(--app-theme-card-border-width) solid var(--app-theme-card-border-color);
    border-radius: var(--app-theme-card-border-radius);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--app-theme-spacing-sm);
  }

  &__section-label {
    margin: 0;
    font-size: 0.85rem;
    font-weight: var(--app-theme-font-weight-bold);
    color: var(--app-theme-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

  &__danger-zone {
    margin-top: var(--app-theme-spacing-lg);
    padding-top: var(--app-theme-spacing-md);
    border-top: 1px solid var(--app-theme-card-border-color);
    display: flex;
    flex-direction: column;
    gap: var(--app-theme-spacing-sm);
  }
}
```

- [ ] **Step 13.4: Verificar build**

Run: `npx ng build --configuration=development`
Expected: aún hay error porque pantry-state.service.ts no expone `editFreshItemModalRequest`. Task 14 lo cierra.

- [ ] **Step 13.5: Commit**

```bash
git add src/app/features/pantry/components/fresh-edit-item-modal
git commit -m "feat(pantry): add fresh edit item modal component"
```

---

## Task 14: Wiring del modal de editar fresco en `pantry.component` y `pantry-state.service`

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`
- Modify: `src/app/features/pantry/pantry.component.ts`
- Modify: `src/app/features/pantry/pantry.component.html`

- [ ] **Step 14.1: Añadir signals de request en `PantryStateService`**

En `pantry-state.service.ts`, justo debajo del signal `editItemModalRequest` (línea 53 aprox), añade:

```ts
readonly editFreshItemModalRequest: WritableSignal<{ mode: 'edit'; item: PantryItem } | null> = signal(null);
```

Y un método para limpiarlo, junto al existente `clearEditItemModalRequest`:

```ts
clearEditFreshItemModalRequest(): void {
  this.editFreshItemModalRequest.set(null);
}
```

- [ ] **Step 14.2: Rutear `openEditModalFromSheet` según `productType`**

Localiza `openEditModalFromSheet` (línea 366 aprox) y modifícalo:

```ts
async openEditModalFromSheet(item: PantryItem): Promise<void> {
  await this.quantitySheet.dismissQuantitySheet();
  const updatedItem = this.pantryItemsState().find(i => i._id === item._id) ?? item;
  if (updatedItem.productType === 'fresh') {
    this.editFreshItemModalRequest.set({ mode: 'edit', item: updatedItem });
    return;
  }
  this.editItemModalRequest.set({ mode: 'edit', item: updatedItem });
}
```

- [ ] **Step 14.3: Importar y proveer el componente en `pantry.component.ts`**

En `src/app/features/pantry/pantry.component.ts`, añade el import y métela en `imports[]`:

```ts
import { FreshEditItemModalComponent } from './components/fresh-edit-item-modal/fresh-edit-item-modal.component';
```

Y en el array de `imports` del decorador `@Component`, añade `FreshEditItemModalComponent`.

- [ ] **Step 14.4: Renderizar el modal en `pantry.component.html`**

Localiza el bloque donde se renderiza `<app-fresh-add-modal>` (línea 187 aprox). Justo después, añade:

```html
<app-fresh-edit-item-modal></app-fresh-edit-item-modal>
```

- [ ] **Step 14.5: Verificar build**

Run: `npx ng build --configuration=development`
Expected: build OK.

- [ ] **Step 14.6: Verificar manualmente**

Run: `npm start`. Tap en el área de info de una tarjeta de fresco → debe abrir el nuevo modal con nombre, segment, fecha y keep-in-stock. Editar y guardar funciona; "Convertir a despensa" mueve el item a la sección Despensa.

- [ ] **Step 14.7: Commit**

```bash
git add src/app/core/services/pantry/pantry-state.service.ts src/app/features/pantry/pantry.component.ts src/app/features/pantry/pantry.component.html
git commit -m "feat(pantry): route fresh edit to dedicated modal"
```

---

## Task 15: Botón "Convertir a fresco" en modal editar despensa

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-edit-item-modal-state.service.ts`
- Modify: `src/app/features/pantry/components/edit-item-modal/edit-item-modal.component.html`
- Modify: `src/app/features/pantry/components/edit-item-modal/edit-item-modal.component.ts`
- Modify: `src/app/features/pantry/components/edit-item-modal/edit-item-modal.component.scss`

- [ ] **Step 15.1: Añadir lógica de conversión y preview en el state service**

En `pantry-edit-item-modal-state.service.ts`, añade los imports necesarios al principio:

```ts
import { AlertController, ToastController } from '@ionic/angular';
import { buildConvertToFreshPreview, consolidateBatchesForFresh } from '@core/domain/pantry';
import { createDocumentId } from '@core/utils';
```

Y declara los nuevos servicios en la clase:

```ts
private readonly alertCtrl = inject(AlertController);
private readonly toastCtrl = inject(ToastController);
```

Después de `submitItem`, añade el nuevo método:

```ts
async convertToFresh(): Promise<void> {
  const existing = this.editingItem();
  if (!existing || existing.productType === 'fresh') return;

  const preview = buildConvertToFreshPreview(existing);

  const stateLabel = this.translate.instant(`pantry.fresh.state.${preview.resultingState}`);
  const dateLabel = preview.resultingExpiration
    ? new Date(preview.resultingExpiration).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : this.translate.instant('common.dates.none');

  const titleKey = 'pantry.fresh.convertToFresh.dialog.title';
  const bodyKey = preview.hadMultipleBatches
    ? 'pantry.fresh.convertToFresh.dialog.bodyMulti'
    : 'pantry.fresh.convertToFresh.dialog.bodySingle';
  const locationsLineKey = 'pantry.fresh.convertToFresh.dialog.locationsLost';

  const bodyParams = {
    batches: preview.batchesCount,
    total: preview.totalQty,
    state: stateLabel,
    date: dateLabel,
  };
  let message = this.translate.instant(bodyKey, bodyParams);
  if (preview.hadLocations) {
    message += '\n\n' + this.translate.instant(locationsLineKey);
  }

  const alert = await this.alertCtrl.create({
    header: this.translate.instant(titleKey),
    message,
    buttons: [
      { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
      {
        text: this.translate.instant('pantry.fresh.convertToFresh.dialog.confirm'),
        role: 'confirm',
      },
    ],
  });
  await alert.present();
  const result = await alert.onDidDismiss();
  if (result.role !== 'confirm') return;

  this.isSaving.set(true);
  try {
    const newBatch = consolidateBatchesForFresh(existing.batches ?? [], createDocumentId('batch'));
    const updated = {
      ...existing,
      productType: 'fresh' as const,
      batches: [newBatch],
      updatedAt: new Date().toISOString(),
    };
    await this.pantryStore.updateItem(updated);
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('pantry.fresh.convertToFresh.toast'),
      duration: 1500,
      position: 'bottom',
    });
    await toast.present();
    this.dismiss();
  } catch (err) {
    console.error('[PantryEditItemModalStateService] convertToFresh error', err);
  } finally {
    this.isSaving.set(false);
  }
}
```

- [ ] **Step 15.2: Añadir el botón en el template del modal de despensa**

En `edit-item-modal.component.html`, justo antes del cierre `</ion-content>` (línea 103 aprox), añade un nuevo bloque secundario:

```html
<div class="edit-item-modal__danger-zone">
  <ion-button
    fill="outline"
    color="medium"
    [disabled]="state.isSaving()"
    (click)="state.convertToFresh()">
    {{ 'pantry.fresh.convertToFresh.button' | translate }}
  </ion-button>
</div>
```

- [ ] **Step 15.3: Estilo de la danger-zone en el `.scss`**

Verifica si `edit-item-modal.component.scss` tiene una regla `.edit-item-modal__danger-zone` o similar. Si no, añade:

```scss
.edit-item-modal__danger-zone {
  margin-top: var(--app-theme-spacing-lg);
  padding-top: var(--app-theme-spacing-md);
  border-top: 1px solid var(--app-theme-card-border-color);
  display: flex;
  flex-direction: column;
  gap: var(--app-theme-spacing-sm);
}
```

- [ ] **Step 15.4: Verificar build**

Run: `npx ng build --configuration=development`
Expected: OK.

- [ ] **Step 15.5: Verificar manualmente**

Run: `npm start`. Abre un item de despensa con varios lotes y pulsa "Convertir a fresco". Debe aparecer el alert con el preview correcto. Confirmar → el item sale de la sección Despensa y aparece en Frescos como Suficiente/Poco/Nada según la cantidad total.

- [ ] **Step 15.6: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-edit-item-modal-state.service.ts src/app/features/pantry/components/edit-item-modal
git commit -m "feat(pantry): convert pantry item to fresh with preview dialog"
```

---

## Task 16: Actualizar i18n en los 6 idiomas

**Files:**
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

> **Importante:** los 6 archivos cambian a la vez. Añade primero todas las claves nuevas en `es.json`, copia la estructura a los otros 5 traduciendo, y elimina las claves muertas en bloque.

### Claves a ELIMINAR (en los 6 idiomas)

Bajo `pantry.fresh`:
- `card.ok` (no se usa)
- `card.soon` (no se usa tras el refactor — verificar con `grep -r 'pantry.fresh.card.soon'`; si nada lo usa, eliminar)
- `basics.yogurt`, `basics.milk`, `basics.eggs`, `basics.tomatoes`, `basics.fruit` (sustituidas por entity selector)
- `basics` entera (queda vacía)
- `toggle.have`, `toggle.out` (el segment no usa toggle)

### Claves a AÑADIR (con valores en es.json — replicar y traducir en los demás)

Bajo `pantry.fresh.state`:

```json
"state": {
  "label": "Estado",
  "sufficient": "Suficiente",
  "low": "Poco",
  "none": "Nada"
}
```

Bajo `pantry.fresh.addModal` (añadir las que faltan):

```json
"cardTitle": "Añade frescos rápido",
"subtitle": "Selecciona un fresco existente o crea uno nuevo.",
"placeholder": "Buscar fresco",
"noResults": "Sin resultados",
"empty": "Aún no has añadido nada."
```

Bajo `pantry.fresh.editModal`:

```json
"editModal": {
  "title": "Editar fresco",
  "stateLabel": "¿Cuánto te queda?"
}
```

Bajo `pantry.fresh.convertToPantry`:

```json
"convertToPantry": {
  "button": "Convertir a despensa",
  "toast": "Movido a despensa"
}
```

Bajo `pantry.fresh.convertToFresh`:

```json
"convertToFresh": {
  "button": "Convertir a fresco",
  "toast": "Movido a frescos",
  "dialog": {
    "title": "Convertir a fresco",
    "bodySingle": "Quedará así:\n· Estado: {{state}} ({{total}} unidades)\n· Caduca: {{date}}",
    "bodyMulti": "Tu producto tiene {{batches}} lotes ({{total}} unidades). Se unirán en un solo lote:\n· Estado: {{state}}\n· Caduca: {{date}}",
    "locationsLost": "Las ubicaciones se perderán.",
    "confirm": "Convertir"
  }
}
```

Bajo `pantry.fresh.empty`:

```json
"empty": {
  "filters": "Ningún fresco coincide con los filtros."
}
```

Bajo `dashboard.today.reason`:

```json
"freshOut": "Te quedaste sin {{name}}.",
"freshExpiring": "Tu {{name}} caduca pronto."
```

> Si `freshExpiring` ya existe (en es.json:166 hay `"freshExpiring": "Está a punto de vencer"`), revisa los textos por interpolación. Las nuevas reasons usan `{{name}}` por consistencia con `expiringsoon`/`expirestoday`. Ajusta el texto si es necesario.

### Traducciones para los demás idiomas

Para cada nueva clave, traduce el valor manteniendo las interpolaciones `{{...}}`. Lista de traducciones sugeridas:

| Clave | en | de | fr | it | pt |
|---|---|---|---|---|---|
| state.label | State | Status | État | Stato | Estado |
| state.sufficient | Plenty | Genug | Assez | Sufficiente | Suficiente |
| state.low | Low | Wenig | Peu | Poco | Pouco |
| state.none | Out | Leer | Vide | Niente | Nada |
| editModal.title | Edit fresh | Frische bearbeiten | Modifier frais | Modifica fresco | Editar fresco |
| editModal.stateLabel | How much is left? | Wie viel bleibt? | Combien il reste ? | Quanto ne resta? | Quanto resta? |
| convertToPantry.button | Convert to pantry | In Vorrat umwandeln | Convertir en garde-manger | Sposta in dispensa | Mover para despensa |
| convertToPantry.toast | Moved to pantry | In Vorrat verschoben | Déplacé vers garde-manger | Spostato in dispensa | Movido para despensa |
| convertToFresh.button | Convert to fresh | In Frische umwandeln | Convertir en frais | Sposta in frescos | Mover para frescos |
| convertToFresh.toast | Moved to fresh | In Frische verschoben | Déplacé vers frais | Spostato in frescos | Movido para frescos |
| convertToFresh.dialog.title | Convert to fresh | In Frische umwandeln | Convertir en frais | Sposta in frescos | Mover para frescos |
| convertToFresh.dialog.bodySingle | (replicar con interpolaciones) | … | … | … | … |
| convertToFresh.dialog.bodyMulti | (replicar con interpolaciones) | … | … | … | … |
| convertToFresh.dialog.locationsLost | Locations will be lost. | Standorte gehen verloren. | Les emplacements seront perdus. | Le posizioni andranno perse. | As localizações serão perdidas. |
| convertToFresh.dialog.confirm | Convert | Umwandeln | Convertir | Sposta | Mover |
| empty.filters | No fresh products match the filters. | Keine frischen Produkte passen zu den Filtern. | Aucun frais ne correspond aux filtres. | Nessun fresco corrisponde ai filtri. | Nenhum fresco corresponde aos filtros. |
| addModal.cardTitle | Quick add fresh | Frische schnell hinzufügen | Ajout rapide frais | Aggiungi frescos veloce | Adicionar frescos rápido |
| addModal.subtitle | Pick or create a fresh product. | Wähle oder erstelle ein frisches Produkt. | Choisis ou crée un frais. | Scegli o crea un fresco. | Escolha ou crie um fresco. |
| addModal.placeholder | Search fresh | Frische suchen | Rechercher frais | Cerca fresco | Buscar fresco |
| addModal.noResults | No results | Keine Ergebnisse | Aucun résultat | Nessun risultato | Sem resultados |
| addModal.empty | Nothing added yet. | Noch nichts hinzugefügt. | Rien d'ajouté. | Niente aggiunto. | Nada adicionado. |
| reason.freshOut | You ran out of {{name}}. | {{name}} ist aufgebraucht. | Tu n'as plus de {{name}}. | {{name}} è finito. | Você ficou sem {{name}}. |
| reason.freshExpiring | Your {{name}} expires soon. | Dein {{name}} läuft bald ab. | Ton {{name}} expire bientôt. | Il tuo {{name}} scade presto. | O seu {{name}} vence em breve. |

- [ ] **Step 16.1: Añadir las claves nuevas en `es.json`**

Edita `src/assets/i18n/es.json` y añade las claves bajo los grupos correspondientes (`pantry.fresh.*`, `dashboard.today.reason.*`).

- [ ] **Step 16.2: Eliminar las claves muertas en `es.json`**

En `src/assets/i18n/es.json`, elimina:
- `pantry.fresh.basics` (objeto entero)
- `pantry.fresh.toggle` (objeto entero)
- `pantry.fresh.card.ok`
- `pantry.fresh.card.soon` (verifica con `grep -r 'pantry.fresh.card.soon' src/` que nadie lo use; si fresh-item-card aún lo usa para días <=3, MANTÉN la clave).

> El TS de Task 6.1 sí usa `pantry.fresh.card.soon` para `d <= 3`, así que **mantén `card.soon`**. Solo elimina `card.ok`.

- [ ] **Step 16.3: Replicar la estructura en los otros 5 idiomas**

Repite los pasos 16.1 y 16.2 para `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`. Usa la tabla de traducciones de arriba.

- [ ] **Step 16.4: Validar JSON**

Run: `node -e "['es','en','de','fr','it','pt'].forEach(l => JSON.parse(require('fs').readFileSync('src/assets/i18n/' + l + '.json', 'utf8')))"`
Expected: sin output (todos parseables).

- [ ] **Step 16.5: Verificar manualmente cada idioma**

Run: `npm start` y cambia el idioma desde Settings. Verifica que:
- El segment de la tarjeta muestra los 3 estados traducidos.
- El modal de añadir fresco muestra título, placeholder y CTA correctamente.
- El modal de editar fresco abre con etiquetas correctas.
- El alert de "Convertir a fresco" muestra preview con interpolaciones funcionando.
- El bloque HOY del dashboard usa la nueva reason `freshOut` cuando el protagonista es un fresco agotado con keep-in-stock activo.

- [ ] **Step 16.6: Commit**

```bash
git add src/assets/i18n
git commit -m "i18n(pantry): add fresh state, edit modal, conversions, and empty filters keys"
```

---

## Task 17: Verificación end-to-end manual

**Files:**
- (no editing — manual QA)

- [ ] **Step 17.1: Smoke test del flujo completo**

Run: `npm start`. Recorre todos estos casos:

1. **Empty state onboarding:** Despeja todos los frescos. La sección Frescos muestra título + CTA "Añadir frescos".
2. **Añadir fresco nuevo:** Tap "+" → escribe "Yogures" → tap CTA "Añadir Yogures" → entry aparece → submit. Aparece como Suficiente.
3. **Añadir fresco existente:** Tap "+" → escribe "Yog" → autocomplete muestra "Yogures" → tap → submit. El batch único pasa a Suficiente (no se duplica).
4. **Cambio de estado:** Tap en "Poco" en la tarjeta → estado cambia, toast confirma. Tap en "Suficiente" → vuelve. Tap "Nada" → quantity=0 visible.
5. **Editar fresco:** Tap en el nombre → modal abre. Cambia nombre, fecha, segment, keep-in-stock. Save. Persiste.
6. **Convertir fresco a despensa:** En el modal de editar fresco, tap "Convertir a despensa" → desaparece de Frescos, aparece en Despensa.
7. **Convertir despensa a fresco (1 lote):** Edita un item de despensa con 1 lote → tap "Convertir a fresco" → diálogo con preview "single" → confirm → aparece en Frescos.
8. **Convertir despensa a fresco (varios lotes):** Edita un item con 3 lotes → tap "Convertir a fresco" → diálogo con preview "multi" mostrando suma de cantidades, fecha más cercana, aviso de locations si las había → confirm → aparece como un único lote en Frescos.
9. **Filtros:** Activa filtro "Caducados". Si hay frescos caducados orientativamente, aparecen; si no, sección Frescos muestra empty corto. Activa filtro "Stock bajo". Frescos en estado "Poco" deberían aparecer.
10. **Dashboard HOY:** Pon un fresco en estado Nada con keepInStock activo → el dashboard debería mostrarlo como protagonista con reason `freshOut`. Pon un fresco caducado orientativamente con keep-in-stock OFF → no debería ganar automáticamente, compite por score con los items de despensa.

- [ ] **Step 17.2: Si todo pasa, hacer push**

```bash
git push origin feat/fresh-products
```

---

## Self-review checklist (interna del implementador)

- [ ] Todos los archivos del File Structure han sido creados o modificados.
- [ ] No queda ninguna referencia a `toggleFreshItem`, `urgentFreshItems`, `pantry.fresh.basics`, ni `common.cancel`.
- [ ] Los 6 idiomas tienen TODAS las claves nuevas con interpolaciones equivalentes.
- [ ] El modal de editar fresco no muestra campos de despensa (categoría, supermercado, foodType).
- [ ] El modal de añadir despensa NO sugiere productos fresh.
- [ ] Items legacy (sin `productType`) aparecen en Despensa, nunca en Frescos.
- [ ] El segment de la tarjeta es idempotente (tap en activo no hace nada).
- [ ] La sección Frescos muestra empty distintos para "no hay nada" vs "filtros no matchean".
