# Productos Frescos — Rediseño

**Fecha:** 2026-04-27
**Branch:** `feat/fresh-products`
**Versión objetivo:** 3.9

## 1. Contexto

La feature de productos frescos se introdujo en este branch para permitir un seguimiento ágil de productos de rotación rápida (yogures, leche, fruta, huevos, etc.). El primer prototipo tiene problemas funcionales y de UX que impiden cerrarla:

- Bugs visibles (`COMMON.CANCEL` sin traducir, ítems duplicados, título de modal cortado).
- Lógica inconsistente con el modelo del resto de la despensa (al hacer toggle se destruyen lotes existentes).
- Modal de edición compartido con despensa, lo cual no permite editar fecha ni estado de un fresco.
- Filtros superiores (Todas/Con stock/Caducados…) no afectan a la sección de frescos.
- Modelo binario "lo tengo / agotado" insuficiente: pierde el aviso de "se está acabando".

Este spec define el rediseño para cerrar la feature.

## 2. Objetivos

1. Simplificar el seguimiento de productos de rotación rápida con un modelo de **3 estados** en lugar del binario actual.
2. Modal de añadir basado en **entity selector** (igual que despensa) con catálogos separados.
3. **Modal de edición específico** para frescos.
4. **Conversión bidireccional** fresh ⇄ pantry, con preview cuando hay riesgo de consolidación de lotes.
5. **Filtros unificados**: la barra superior aplica a frescos y despensa por igual.
6. Resolver los bugs críticos.

## 3. Alcance / fuera de alcance

**En alcance:**
- Refactor del modal de añadir fresco con entity selector.
- Filtrado del entity selector del modal de añadir despensa para ocultar frescos.
- Tarjeta de fresco con segment control de 3 estados.
- Modal específico para editar frescos (componente nuevo).
- Botón "Convertir a fresco" en modal de editar despensa con diálogo de confirmación informativo.
- Botón "Convertir a despensa" en modal de editar fresco.
- Filtros existentes aplican a frescos. Sección Frescos se oculta si queda vacía tras filtrar.
- Logging de eventos en historial al añadir un fresco.
- Bugs listados en la sección 8.

**Fuera de alcance:**
- Cambios al modelo de datos (`PantryItem` y `ItemBatch` se mantienen).
- Selector de cantidad en el modal de añadir (arranca siempre en Suficiente).
- Múltiples lotes para frescos (es 1 lote por convención, no por restricción del modelo).
- Migración explícita de items legacy (se resuelve por convención de lectura).
- Rediseño de la sección de despensa.

## 4. Modelo de datos

**Sin cambios en `PantryItem` ni `ItemBatch`.**

- `productType: 'fresh' | 'pantry'` ya existe en el modelo.
- Items legacy (sin `productType` definido) se tratan como `'pantry'` por convención de lectura. **No hay migración**: cualquier filtro que distingue tipos usa `item.productType === 'fresh'` (estricto), y el resto cae como despensa.
- Frescos: por convención exactamente **1 lote** (`item.batches.length === 1`). El código defensivamente preserva la estructura `batches[]` y nunca asume que un fresco tiene exactamente uno al editar; pero al crear y al consolidar siempre produce uno.

### Mapeo estado ⇄ cantidad

El estado visual de un fresco se calcula a partir de la cantidad del único lote:

| Estado | Cantidad |
|---|---|
| Suficiente | 3 |
| Poco | 1 |
| Nada | 0 |

Al cambiar de estado, la cantidad del lote se setea al valor correspondiente. Los demás campos del lote (`expirationDate`, `batchId`, `locationId`, `opened`) se preservan.

Las constantes vivirán en `core/domain/pantry/fresh.domain.ts` (módulo nuevo).

## 5. UI / componentes

### 5.1. Tarjeta de fresco (`FreshItemCardComponent`)

Refactor sobre el componente existente:

- El icono toggle binario se sustituye por un **segment control de 3 botones**: Suficiente / Poco / Nada.
- El botón activo refleja el estado actual (color y peso visual).
- Tap directo en cualquier botón cambia el estado (no abre modal).
- Tap en el botón ya activo es idempotente (no hace nada, no se convierte en deselección).
- Tap en la zona de info (nombre + fecha) sigue abriendo el modal de edición.
- La etiqueta de urgencia de caducidad (Hoy/Mañana/Pronto/Caducado) se mantiene.

### 5.2. Modal de añadir fresco (`FreshAddModalComponent`)

Refactor:

- Sustituir los chips estáticos de "basics" por el **entity selector** (autocomplete) que ya usa el modal de añadir despensa.
- El catálogo del autocomplete filtra a `productType === 'fresh'`.
- Selección de existente → **actualiza el lote único** del fresco: cantidad pasa a 3 (Suficiente) y, si se eligió fecha en los chips, sobrescribe la fecha del lote. **No** se llama a `addNewLot` (un fresco mantiene 1 lote por convención). Si el item ya tenía `keepInStock` activo no se desactiva; si el modal lo activa, se pone a true.
- Crear nuevo → crea `PantryItem` con `productType: 'fresh'`, batch único con cantidad inicial **3** (estado Suficiente), fecha opcional, `keepInStock` opcional.
- Mantiene los chips de fecha rápida y el toggle "Volver a comprar automáticamente".
- Al submit: log en `HistoryEventManagerService` (consistente con add normal).

### 5.3. Modal de añadir despensa

Cambio mínimo: el entity selector filtra `productType !== 'fresh'`. Items legacy sin `productType` siguen apareciendo (caen como despensa).

Al crear un item nuevo desde este modal, se asigna explícitamente `productType: 'pantry'`.

### 5.4. Modal de editar fresco (`FreshEditItemModalComponent` — nuevo)

Componente nuevo, mínimo y específico:

- Campo: nombre.
- Campo: fecha de caducidad (mismos chips de quick-date que el modal de añadir + opción "sin fecha").
- Campo: estado (segment Suficiente / Poco / Nada — mismo control que la tarjeta).
- Toggle: keep-in-stock.
- Botón secundario: **"Convertir a despensa"** → cambia `productType` a `'pantry'` y cierra el modal.
- Botón destructivo: eliminar.

NO incluye: categoría, supermercado, foodType, ubicación, lotes (todos irrelevantes o redundantes para un fresco).

### 5.5. Modal de editar despensa

Añadir botón secundario: **"Convertir a fresco"**.

Al pulsarlo siempre se muestra un diálogo de confirmación con preview. El texto del cuerpo se adapta al caso:

- **1 lote:**

  > **Convertir a fresco**
  > Quedará así:
  > · Estado: **{Suficiente|Poco|Nada}** ({total} unidades)
  > · Caduca: **{fecha}** (o "sin fecha")
  >
  > [Cancelar] [Convertir]

- **>1 lote:**

  > **Convertir a fresco**
  > Tu producto tiene {N} lotes ({total} unidades). Se unirán en un solo lote:
  > · Estado: **{Suficiente|Poco|Nada}**
  > · Caduca: **{fecha más cercana}** (o "sin fecha")
  >
  > {Si había locations:} Las ubicaciones se perderán.
  >
  > [Cancelar] [Convertir]

Reglas al convertir:
- `total >= 3` → Suficiente (qty=3)
- `total 1-2` → Poco (qty=1)
- `total 0` → Nada (qty=0)
- Fecha del lote consolidado: la más cercana a hoy entre los lotes existentes (no la más temprana absoluta — la más urgente). Si ninguno tiene, sin fecha.
- `locationId` se descarta.
- `opened` del consolidado: `true` si cualquier lote estaba abierto.
- `productType` pasa a `'fresh'`.
- `batchId` nuevo.

### 5.6. Filtros superiores

Sin cambios estructurales. Los filtros existentes (`expired`, `expiring`, `lowStock`, `normalOnly`, `basic`, búsqueda por texto) aplican a **ambas listas**:

- `freshItems` se computa a partir de `pantryItemsState` (filtrado), no de `loadedProducts()` (sin filtrar). Así los filtros impactan también a la sección Frescos.
- `despensaItems` sigue filtrando por `productType !== 'fresh'` sobre el mismo `pantryItemsState`.
- Distinción importante (espejo del comportamiento de despensa):
  - **0 frescos en absoluto** (sin filtros): se muestra el **empty state de onboarding** existente (cabecera + CTA "Añadir frescos").
  - **>0 frescos pero 0 visibles tras filtro**: la sección sigue visible con un **empty state corto de "ningún fresco coincide con los filtros"**, igual que hace la despensa cuando no hay matches. Esto mantiene unidad visual entre ambas secciones y evita que la sección "salte" al filtrar.
- La distinción entre los dos casos se hace comparando el total de frescos en el dataset crudo (`loadedProducts().filter(i => i.productType === 'fresh').length`) con `freshItems().length` (filtrado).

Conteos de los chips de filtro: incluyen ambas listas (despensa + frescos). El total visible queda coherente con la suma de las dos secciones.

### 5.7. Bloque "Hoy" del dashboard

La fecha de caducidad de un fresco es **orientativa** (la pone el usuario por estimación: "Hoy", "2 días"…), mientras que la de un lote de despensa viene impresa en el envase. Tratarlas con el mismo peso satura el bloque HOY de falsos positivos.

**Modelo simplificado:**

1. **Eliminar el "auto-win" de frescos.** Hoy, [dashboard-state.service.ts:84-95](src/app/core/services/dashboard/dashboard-state.service.ts#L84-L95) hace que cualquier fresco con días ∈ [0, 1] gane el bloque inmediatamente. Se elimina por completo este atajo.

2. **Factor de confianza:** los frescos compiten en el mismo pool que los productos de despensa, pero su urgency score se multiplica por una constante **`FRESH_URGENCY_FACTOR = 0.7`** antes de combinarlo con el food-type score y los demás bonuses. Refleja que la fecha es menos vinculante.

3. **Excepción única — fresco agotado que se repone solo:** si el item es fresco con estado **Nada** (`qty === 0`) y `keepInStock` activo, se le suma un **bonus de +80 al score**. Esta es la única regla especial; representa una señal genuina (te quedaste sin un fresco que sueles tener en casa).

4. **Sin más reglas por días.** Los frescos caducados orientativamente, los que caducan hoy/mañana, y los que están en estado Poco simplemente compiten con el score reducido. Si ganan, ganan; si no, no aparecen en HOY.

**Inclusión en el pool de candidatos:**

- Los frescos con `expirationDate` y `qty > 0` ya entran en `nearExpiryItems` por el pipeline existente.
- Los frescos con estado Nada + keepInStock no tienen por qué tener fecha; entran al pool de candidatos por una ruta nueva en `computeTodaySuggestion` (no dependen de `hasDatedBatch`).

**Reason keys** — solo dos para frescos:

- `dashboard.today.reason.freshOut` — ganador por la excepción del +80 (fresco en Nada con keepInStock).
- `dashboard.today.reason.freshExpiring` — ganador por score normal (con factor 0.7 aplicado).

La asignación se hace al final de `computeTodaySuggestion`: si el protagonista es fresh + Nada + keepInStock → `freshOut`; si es fresh por cualquier otra razón → `freshExpiring`; si no es fresh, las reasons existentes (`expiringsoon`, `expirestoday`, `expiringlater`).

## 6. Flujos clave

### 6.1. Añadir fresco
1. Tap "+" en cabecera de Frescos.
2. Modal abre con autocomplete enfocado.
3. Usuario teclea → ve sugerencias de frescos existentes.
4. Selecciona existente → ítem se añade como nuevo lote a ese fresco (qty=3 por defecto, fecha de los chips).
5. O escribe un nombre nuevo + tap "Crear" → ítem nuevo con `productType='fresh'`, qty=3, fecha y keep-in-stock opcionales.
6. Submit → log de evento en historial → modal cierra.

### 6.2. Cambiar estado desde la tarjeta
1. Tap en uno de los 3 botones (Suficiente / Poco / Nada).
2. `pantryStore.updateItem` con el batch actualizado (preserva los demás campos del batch).
3. Toast breve confirmando el cambio.

### 6.3. Editar fresco
1. Tap en la zona de info de la tarjeta.
2. `FreshEditItemModalComponent` abre.
3. Usuario edita nombre / fecha / estado / keep-in-stock.
4. Guardar → `pantryStore.updateItem` y cierre.
5. Alternativa: tap "Convertir a despensa" → `productType='pantry'` y cierre.

### 6.4. Convertir despensa → fresco
1. En el modal de editar despensa, tap "Convertir a fresco".
2. Diálogo de confirmación con preview de qué pasará.
3. Confirmar → consolidar batches según las reglas de §5.5, `productType='fresh'`, persist, cerrar modal.

### 6.5. Filtrar
1. Usuario tap en chip de filtro (ej. "Caducados").
2. Pipeline existente filtra `pantryItemsState`.
3. Sección Frescos: si quedan ≥1 frescos que cumplen, se muestran; si hay frescos creados pero ninguno coincide, se muestra empty state corto ("Ningún fresco coincide con los filtros").
4. Sección Despensa: igual que antes.

## 7. Capa de dominio

Módulo nuevo: `core/domain/pantry/fresh.domain.ts`

```ts
// Constantes de cantidad por estado
export const FRESH_QTY = { sufficient: 3, low: 1, none: 0 } as const;

export type FreshState = 'sufficient' | 'low' | 'none';

// quantity → estado
export function qtyToFreshState(qty: number): FreshState;

// estado → quantity
export function freshStateToQty(state: FreshState): number;

// Consolida n lotes en uno solo (para convertir despensa → fresco)
export function consolidateBatchesForFresh(batches: ItemBatch[]): ItemBatch;

// Preview que se muestra al usuario antes de convertir
export interface ConvertToFreshPreview {
  totalQty: number;
  resultingState: FreshState;
  resultingExpiration?: string;
  resultingNoExpiry: boolean;
  hadMultipleBatches: boolean;
  hadLocations: boolean;
}
export function buildConvertToFreshPreview(item: PantryItem): ConvertToFreshPreview;
```

Funciones puras, cero deps de Angular, fáciles de testear.

**Cambios en `core/domain/dashboard/dashboard.domain.ts`:**

Nueva constante exportada:

```ts
export const FRESH_URGENCY_FACTOR = 0.7;
export const FRESH_OUT_BONUS = 80;
```

`scoreItem` (interna a `computeTodaySuggestion`) pasa a aplicar:

```ts
const isFresh = item.productType === 'fresh';
let urgency = getUrgencyScore(days);
if (isLowStock)         urgency += 25;
if (isFastMoving(type))  urgency += 10;
if (isFresh)             urgency *= FRESH_URGENCY_FACTOR;     // factor de confianza

let total = urgency + (HOY_FOOD_TYPE_SCORE[type] ?? 0);

const isFreshOut = isFresh && stock === 0 && (item.minThreshold ?? 0) >= 1;
if (isFreshOut) total += FRESH_OUT_BONUS;                      // excepción única

return total;
```

`computeTodaySuggestion`:

- **Eliminar el bloque inicial de auto-win por `urgentFreshItems`** (deja de recibir ese parámetro; la firma se simplifica).
- El pool de candidatos se amplía: además de `nearExpiryItems`, se incluyen los frescos con `qty === 0 && keepInStock` aunque no tengan `expirationDate` y aunque no estén en `nearExpiryItems`. Estos no requieren `hasDatedBatch`.
- Tras seleccionar al protagonista, asignar `reasonKey`:
  - Si es fresh + Nada + keepInStock → `dashboard.today.reason.freshOut`.
  - Si es fresh por cualquier otra razón → `dashboard.today.reason.freshExpiring`.
  - Si no es fresh → reasons existentes (`expiringsoon` / `expirestoday` / `expiringlater`).

**Cambios en `dashboard-state.service.ts`:**

- Eliminar el computed `urgentFreshItems` (ya no se usa).
- `todaySuggestion` deja de pasarle el cuarto argumento; la nueva firma de `computeTodaySuggestion` es `(nearExpiryItems, allItems, skipId)`.

## 8. Bugs a resolver en el mismo cambio

1. **`common.cancel` no existe** ([fresh-add-modal.component.html:8](src/app/features/pantry/components/fresh-add-modal/fresh-add-modal.component.html#L8)) → cambiar a `common.actions.cancel`.
2. **Duplicación al añadir fresco con nombre existente** → resuelto al usar entity selector que detecta existentes y añade lote.
3. **`toggleFreshItem` machaca `batches`** ([pantry-state.service.ts:372-385](src/app/core/services/pantry/pantry-state.service.ts#L372-L385)) → reemplazar por método que actualiza la cantidad del lote único preservando el resto, e idealmente conserva otros lotes si por algún motivo existieran.
4. **Título "Nuevo produc…" cortado** → cambiar `pantry.fresh.addModal.title` de "Nuevo producto fresco" a "Nuevo fresco" (más corto y suficiente).
5. **Chips de fecha no enfatizados parecen disabled** → ajustar el SCSS de `quick-date-chips` para que los no enfatizados tengan contraste suficiente para no parecer rotos.
6. **Llaves i18n muertas** (`pantry.fresh.card.ok`, `soon` cuando no se usa) → eliminar las que no se usan; o usar `ok` para >3 días con visual neutral. Decisión: eliminar.
7. **Falta logging en historial al añadir fresco** → llamar a `HistoryEventManagerService` igual que el add normal.
8. **`urgentFreshItems` ignora caducados** → ver §5.7.

## 9. i18n

Cambios en los 6 idiomas (`es`, `en`, `de`, `fr`, `it`, `pt`):

**Eliminar:**
- `pantry.fresh.card.ok` (no se usa).
- `pantry.fresh.card.soon` si tampoco se usa tras el refactor.
- `pantry.fresh.basics.*` (el entity selector reemplaza los chips estáticos).

**Añadir:**
- `pantry.fresh.state.sufficient`, `state.low`, `state.none` — etiquetas del segment.
- `pantry.fresh.editModal.title`, `editModal.deleteConfirm`.
- `pantry.fresh.convertToPantry.button`.
- `pantry.fresh.convertToFresh.button` (en modal de despensa).
- `pantry.fresh.convertToFresh.dialog.title`, `dialog.body`, `dialog.confirm`, `dialog.cancel`.
- `pantry.fresh.convertToFresh.dialog.bodyMultiBatch` con interpolación `{batches}, {total}, {state}, {date}`.
- `pantry.fresh.empty.filters` — empty state corto cuando los filtros no dejan ningún fresco.
- `dashboard.today.reason.freshOut` — texto cuando el protagonista es un fresco agotado con keep-in-stock.
- `dashboard.today.reason.freshExpiring` — ya existe; se mantiene y se reutiliza para frescos que ganan por score normal.

**Modificar:**
- `pantry.fresh.addModal.title`: "Nuevo producto fresco" → "Nuevo fresco".

## 10. Testing

Verificación manual en dispositivo / emulador (no se añaden tests unitarios en este cambio):

- Flujo completo de añadir fresco con autocomplete (existente y nuevo).
- Cambio de estado desde la tarjeta — sin perder fecha ni keep-in-stock.
- Edición desde modal específico.
- Conversión despensa → fresco con 1 lote y con varios lotes (verificar diálogo en ambos casos).
- Conversión fresco → despensa.
- Filtros aplicados a frescos: la sección muestra empty state corto cuando hay frescos creados pero ninguno coincide con los filtros; el empty state de onboarding se mantiene cuando no hay ningún fresco creado.
- "Hoy" del dashboard surfacea correctamente un fresco caducado.
- Items legacy sin `productType`: aparecen en despensa y nunca en frescos.

## 11. Riesgos y mitigaciones

- **Riesgo:** items legacy en pantalla de un usuario que ya tenía "yogures" en despensa pueden generar confusión: aparecen abajo en despensa, pero ahora hay sección de frescos arriba vacía con su empty state.
  **Mitigación:** la opción "Convertir a fresco" desde el modal de despensa permite migrar manualmente con preview claro. No hay migración automática.

- **Riesgo:** un fresco con la convención de 1 lote acaba con varios lotes por una operación inesperada (ej. `addNewLot` se llama sobre un fresco).
  **Mitigación:** la lógica del modal de añadir fresco, cuando detecta un existente, debe **sobrescribir el lote** (subir a Suficiente y actualizar fecha) en vez de añadir un nuevo lote. Esto preserva la convención.

- **Riesgo:** segment control con 3 botones puede no caber en pantallas estrechas.
  **Mitigación:** botones con flex y texto corto; en su defecto solo iconos con `aria-label`. Verificar en pantallas de 320px.

## 12. Plan de roll-out

Todo en un único cambio en `feat/fresh-products`. La feature no está liberada todavía (es la 3.9), no hace falta feature flag ni estrategia gradual.
