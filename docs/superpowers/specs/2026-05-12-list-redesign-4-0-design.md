# List Redesign 4.0 — Design Spec

**Date:** 2026-05-12  
**Branch:** release/4.0  
**Scope:** Shopping list — redesign completo del flujo de reposición

---

## Goal

Convertir la lista de la compra de una pantalla de solo lectura en un flujo rápido y automático de reposición conectado al inventario. Mínima fricción, 1 tap = acción.

---

## Decisions made

| Decision | Choice |
|---|---|
| Reposición al marcar comprado | Automática, sin fecha, usa `suggestedQuantity` |
| Limpieza de "Comprado" | Al salir de pantalla (`ionViewWillLeave`) — in-memory |
| Ítems manuales | Texto libre, ephemeral, no tocan inventario |
| Agrupación principal | Supermercado primero, urgencia dentro de cada grupo |
| Nuevos estados visuales | NO — mantener amarillo/rojo existentes |

---

## Architecture approach

**Opción A:** Extender `ListStateService` en sitio (page-scoped). Sin nuevos servicios.

Ficheros afectados:
- `core/models/list/list.model.ts`
- `core/domain/list/list.domain.ts`
- `core/utils/list-grouping.util.ts`
- `core/services/list/list-state.service.ts`
- `features/list/list.component.ts`
- `features/list/list.component.html`
- `features/list/list.component.scss`
- `src/assets/i18n/{es,en,de,fr,it,pt}.json`

---

## Model changes (`list.model.ts`)

### `ShoppingReason` (enum ampliado)

```ts
export enum ShoppingReason {
  EMPTY       = 'empty',
  BELOW_MIN   = 'below-min',
  FRESH_EMPTY = 'fresh-empty', // nuevo
  MANUAL      = 'manual',      // nuevo
}
```

### `BoughtItem` (nuevo — ephemeral)

```ts
export interface BoughtItem {
  id: string;           // pantry item _id, o uuid para manuales
  name: string;
  supermarket?: string;
}
```

### `ManualItem` (nuevo — ephemeral)

```ts
export interface ManualItem {
  id: string;
  name: string;
}
```

### `ShoppingSuggestionGroup` (actualizado)

```ts
export interface ShoppingSuggestionGroup<TItem = string> {
  key: string;
  label: string;
  suggestions: ShoppingSuggestion<TItem>[];  // pendientes, ordenados por urgencia
  boughtItems: BoughtItem[];                  // comprados ephemeros del grupo
}
```

### `ShoppingSummary` (actualizado)

```ts
export interface ShoppingSummary {
  total: number;
  belowMin: number;
  empty: number;
  supermarketCount: number;
  boughtCount: number; // nuevo
}
```

### Urgency weight (constante en domain, no campo del modelo)

```ts
export const URGENCY_WEIGHT: Record<ShoppingReason, number> = {
  [ShoppingReason.FRESH_EMPTY]: 1,
  [ShoppingReason.EMPTY]:       2,
  [ShoppingReason.BELOW_MIN]:   3,
  [ShoppingReason.MANUAL]:      4,
};
```

---

## Domain changes (`list.domain.ts`)

### `determineSuggestionNeed` — añadir soporte para frescos

Cuando el item tiene `productType === 'fresh'` y `totalQuantity <= 0`, devuelve `reason: ShoppingReason.FRESH_EMPTY` en lugar de `EMPTY`.

### Nueva función `sortSuggestionsByUrgency`

```ts
export function sortSuggestionsByUrgency(
  suggestions: ShoppingSuggestionWithItem[]
): ShoppingSuggestionWithItem[]
```

Ordena usando `URGENCY_WEIGHT[suggestion.reason]` ASC.

### Nueva función `buildManualSuggestion`

```ts
export function buildManualSuggestion(item: ManualItem): ShoppingSuggestion<ManualItem>
```

Crea una sugerencia con `reason: MANUAL`, `suggestedQuantity: 1`, `urgencyWeight: 4`.

---

## Service changes (`list-state.service.ts`)

### Nuevas señales

```ts
readonly boughtItemIds  = signal<Set<string>>(new Set());
readonly removedAutoIds = signal<Set<string>>(new Set()); // ítems auto eliminados manualmente
readonly manualItems    = signal<ManualItem[]>([]);
```

### Computed actualizado

`shoppingAnalysis` — añade la lógica para:
1. Detectar frescos vacíos y asignarles `FRESH_EMPTY`
2. Incorporar `manualItems` como sugerencias adicionales
3. Pasar `boughtItemIds` al `groupSuggestionsBySupermarket` para excluir comprados de `suggestions` y construir `boughtItems` por grupo
4. Ordenar `suggestions` de cada grupo con `sortSuggestionsByUrgency`
5. Calcular `summary.boughtCount`

### Nuevos métodos

```ts
markAsBought(suggestion: ShoppingSuggestionWithItem | ShoppingSuggestion<ManualItem>): Promise<void>
removeFromList(id: string): void
restoreFromBought(id: string): void
addManualItem(name: string): void
```

**`markAsBought` para auto-items (pantry):**
1. Añadir `id` a `boughtItemIds`
2. Llamar `pantryStore.addNewLot(item._id, { quantity: suggestedQty, expirationDate: null })`
   - Para frescos: usar `FRESH_QTY.sufficient` como quantity en lugar de `suggestedQty`
3. Registrar evento en `HistoryEventManagerService`

**`markAsBought` para manual:**
1. Solo añadir a `boughtItemIds` — no toca inventario

**`removeFromList`:** quita el item de `manualItems` o añade a un set de `removedAutoIds` para filtrar el computed.

**`restoreFromBought`:** quita el id de `boughtItemIds`.

### Limpieza

```ts
async ionViewWillLeave(): Promise<void> {
  this.boughtItemIds.set(new Set());
  this.manualItems.set([]);
}
```

---

## UI changes (`list.component.html`)

### Estructura por grupo de supermercado

```
[ion-item-group]  Mercadona (3)           ← collapsible, contador = pending
  [Pendientes]
    [ion-item-sliding] Pollo              ← tap = markAsBought, swipe-left = remove
      chip: 🥬 Fresco agotado
    [ion-item-sliding] Arroz
      chip: 🟥 Agotado
  [Comprados] (colapsado por defecto)
    Leche ✓
    Pan ✓
```

### Gestos por ítem

| Gesto | Acción |
|---|---|
| Tap | `markAsBought()` |
| Swipe izquierda | `removeFromList()` — `ion-item-option` destructivo |
| Swipe derecha (en comprados) | `restoreFromBought()` |

### Chips de razón

| `ShoppingReason` | Chip |
|---|---|
| `FRESH_EMPTY` | 🥬 `shopping.reason.freshEmpty` |
| `EMPTY` | `shopping.reason.empty` |
| `BELOW_MIN` | `shopping.reason.belowMin` |
| `MANUAL` | — (sin chip) |

Si el item tiene `isBasic = true`, se muestra adicionalmente el chip ⭐ `shopping.reason.basic`.

### Cantidades en lenguaje natural

- `EMPTY` / `FRESH_EMPTY`: `"Comprar {{ qty }}"`
- `BELOW_MIN`: `"Faltan {{ qty }} para el mínimo"`
- `MANUAL`: `"Añadir"`

### FAB secundario — añadir manual

Botón flotante pequeño (fill=clear, size=small) en esquina inferior. Abre un `ion-alert` con un input de texto. Sin modal completo.

### Empty state

Cuando `summary.total === 0` y `summary.boughtCount === 0`:  
`"Los productos agotados aparecerán aquí automáticamente."`

---

## i18n — nuevas claves (en todos los idiomas)

```json
"shopping": {
  "reason": {
    "freshEmpty": "Fresco agotado",
    "empty": "Agotado",
    "belowMin": "Stock bajo",
    "basic": "Básico"
  },
  "qty": {
    "toBuyQty": "Comprar {{qty}}",
    "belowMinQty": "Faltan {{qty}} para el mínimo",
    "add": "Añadir"
  },
  "bought": {
    "sectionTitle": "Comprado",
    "count": "{{count}} comprado"
  },
  "manualAdd": {
    "placeholder": "Nombre del producto",
    "button": "Añadir a la lista"
  },
  "emptyStates": {
    "autoHint": "Los productos agotados aparecerán aquí automáticamente."
  }
}
```

---

## Out of scope (4.0)

- Caducidad inteligente / `ExpirySensitivity` (spec separado)
- Historial de compras
- Sincronización entre dispositivos
- Prioridades manuales de ítems
- Notificaciones de lista
