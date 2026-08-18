# Bulk-fix de items "pendientes" (foodType / fecha caducidad)

Branch: `feat/pendientes-bulk-fix-5.2` (desde `release/5.2`)

## Contexto

5.2 evalúa como candidato de fricción "fecha de caducidad por defecto + bulk-fix de
pendientes". Investigación reveló que buena parte de la infraestructura **ya existe**:

- `isIncomplete(item)` (`core/domain/pantry/pantry-filtering.domain.ts:40`) ya marca un item
  como "pendiente" si le falta `foodType` **o** si tiene algún batch sin `expirationDate` y
  sin `noExpiry`.
- Filtro `pendientes` ya existe en `PantryStatusFilterValue`
  (`core/models/pantry/pantry-list.model.ts:5`) y en `PantrySummaryMeta.statusCounts`.
- Chip "Pendientes" ya visible en la barra de resumen de la tab Despensa.
- Insights ya tiene un label/CTA que navega a pendientes vía
  `InsightsComponent.goToPendientes()` → `navigationPreset.setPending()` → `/pantry`.

Lo que **no existe**: al entrar en la vista filtrada de pendientes, el usuario ve la lista
normal de tarjetas y tiene que abrir el modal de edición completo item por item para rellenar
`foodType` y/o fecha. No hay atajo.

También se descartó explícitamente durante el diseño una idea inicial de "fecha por defecto
al añadir producto": ni el modal de añadir (fast-add) ni el flujo de escaneo de ticket
capturan `foodType` en el momento de alta — `buildAddItemPayload()`
(`core/domain/pantry/pantry-builder.domain.ts`) no recibe ni asigna `foodType`. `foodType`
solo se rellena hoy a mano desde el modal de edición completo
(`pantry-edit-item-modal-state.service.ts:38-60`). Sin `foodType` en ese momento no hay base
para sugerir fecha, y forzar su captura en el alta rápida iría contra el objetivo de reducir
fricción ahí. Por tanto: **sin cambios en el flujo de alta** (ni fast-add ni ticket-scan).

## Objetivo

Convertir la vista de pendientes en un flujo de **corrección rápida en bloque**:

1. Reutilizar el filtro `pendientes` existente (misma fuente de verdad: `isIncomplete`).
2. Por cada item incompleto, permitir fijar `foodType` (si falta) y fecha de caducidad de
   sus batches (si falta), en una fila compacta — sin abrir el modal de edición completo.
3. Una vez elegido `foodType` en una fila, sugerir automáticamente una fecha de caducidad
   (editable) según una tabla de duración estimada por `foodType`.
4. Guardar todas las filas tocadas de una sola vez.
5. Los items no tocados por el usuario siguen "pendientes" — no se fuerza a completar todo.

## Diseño

### 1. Tabla de sugerencia — `core/domain/pantry/expiry-suggestion.domain.ts` (nuevo)

```ts
import { FoodType } from '@core/models/shared/enums.model';

export const EXPIRY_SUGGESTION_DAYS: Record<FoodType, number> = {
  [FoodType.Protein]: 5,
  [FoodType.Carb]: 270,
  [FoodType.Vegetable]: 7,
  [FoodType.Fruit]: 7,
  [FoodType.Dairy]: 14,
  [FoodType.Household]: 365,
  [FoodType.Other]: 120,
};

export function suggestExpiryDate(foodType: FoodType, fromIso: string): string {
  const days = EXPIRY_SUGGESTION_DAYS[foodType];
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
```

Pura, sin dependencias Angular. Valores iniciales orientativos — ajustables sin tocar el
resto del diseño. Solo se usa desde la pantalla de bulk-fix (no hay hook de alta).

### 2. Pantalla "Completar pendientes"

Nueva ruta modal/sheet accesible desde:
- Chip "Pendientes" existente en Despensa (hoy solo filtra la lista → pasa a abrir esta
  pantalla en su lugar, o añade una acción secundaria "Completar" sobre la lista filtrada;
  a decidir en plan de implementación).
- CTA existente en Insights (`goToPendientes()`).

Fuente de datos: mismo predicado `isIncomplete()` sobre `pantryStore.loadedProducts`.

Por item incompleto, una fila:
- Si falta `foodType`: 7 chips de selección rápida (reusa i18n `pantry.form.foodType.*`,
  mismo enum que `pantry-edit-item-modal-state.service.ts:38`).
- Campo fecha por batch sin `expirationDate`: vacío hasta que se resuelve `foodType` (el que
  ya tenga el item o el recién elegido en la fila); al resolverse, se pre-rellena con
  `suggestExpiryDate()`. Editable manualmente en cualquier momento.
- Si el item ya tiene `foodType` pero solo falta fecha, el campo se pre-rellena directamente.

Botón "Guardar todo": aplica en batch las filas con cambios reales (foodType y/o fecha
tocados). Items sin cambios no se tocan y siguen apareciendo como pendientes.

### 3. Persistencia

Reutiliza las operaciones ya existentes de update de item/batch (`PantryStoreService`,
`PantryBatchOperationsService`) — sin nuevo modelo de datos, sin nuevos campos en
`PantryItem`/`ItemBatch`. Logging de historial vía `HistoryEventManagerService` como el resto
de mutaciones de pantry (tipo de evento a definir: reutilizar `edit-item` o añadir uno nuevo
específico, a decidir en plan).

## Fuera de alcance

- Cambios en el modal de alta (fast-add) o en el parser de ticket — no capturan `foodType`,
  no se toca.
- Nueva tabla de shelf-life por `categoryId` — categoría es texto libre del usuario, no un
  enum fijo; se descarta como base de la sugerencia.
- Banner nuevo en Despensa — los puntos de entrada (chip + label Insights) ya existen.
