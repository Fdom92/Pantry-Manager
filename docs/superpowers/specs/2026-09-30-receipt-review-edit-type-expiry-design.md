# Revisión de ticket — editar tipo y caducidad por línea

**Fecha:** 2026-09-30. **Rama destino:** por decidir al escribir el plan (rama nueva de
funcionalidad, no `release/5.6` que ya está fusionada). Origen: mejora propuesta por Fernando
tras el rediseño de Insights.

## Por qué

Al escanear un ticket, cada línea ya recibe automáticamente un tipo de alimento
(`inferFoodType`) y una fecha de caducidad sugerida (`resolveSuggestedExpiry`) — el mismo
motor que usa el alta manual (`pantry-builder.domain.ts:48-53`, confirmado con test de
`buildAddItemPayload`). Pero la pantalla de revisión
(`receipt-scan-modal.component.html`) no expone ningún control para verlos ni corregirlos:
solo nombre (vía diálogo de alerta), cantidad y check de incluir/excluir. El tipo y la fecha
inferidos entran a ciegas al confirmar, sin que el usuario pueda ver si el OCR o la inferencia
acertaron. El alta manual sí tiene ambos controles — `app-food-type-picker` y
`app-expiry-picker` — ya construidos y reutilizados en tres sitios distintos
(`entity-selector-modal.component.html:77-98`).

## Qué construimos

Un acordeón por línea: colapsada, la fila se ve casi igual que hoy; una flecha `⌄` al final
la expande y revela los selectores de tipo/fecha ya existentes, reutilizados sin cambios.

**Interacción:**
- La flecha de expandir es un control aparte, al final de la fila — tocar el nombre sigue
  abriendo el diálogo de renombrar (`editLineName`), sin cambios de comportamiento ahí.
- Todas las líneas arrancan colapsadas. No hay auto-expansión por baja confianza ni acciones
  masivas ("expandir todas") — YAGNI, se añade si hace falta con datos reales.
- Colapsada, la línea de metadatos actual (`➕ Producto nuevo` / `🔗 Ya en tu despensa` /
  `🌱 Match frescos`) se combina con el resumen de tipo/fecha en una sola línea de texto:
  `➕ Nuevo · Fruta · caduca 12 oct`. No se añade una segunda línea — una lista de 15-20
  productos no puede permitirse que cada fila crezca dos veces.
- Expandida, aparecen los selectores inline: `app-food-type-picker` (solo si la línea admite
  editar tipo) y `app-expiry-picker` en modo `picker-only` (si la línea admite editar fecha),
  mismo patrón visual que ya usa `entity-selector-modal`.

**Qué es editable según el tipo de línea** (confirmado leyendo `pantry-receipt-scan-modal-state.service.ts`,
no solo el modelo — el comportamiento real de `submit()` difiere entre casos):

| Línea | Tipo editable | Fecha editable | Por qué |
|---|---|---|---|
| Producto nuevo (`!isAutoMatch`) | Sí | Sí | Se crea desde cero, como el alta manual. |
| Emparejado, no fresco (`isAutoMatch && !isFreshMatch`) | **No** | Sí | El tipo ya es una propiedad del producto existente — cambiarlo aquí cambiaría el producto entero, no solo este lote. Solo se añade un lote nuevo (`addNewLot`), y la fecha es del lote. |
| Emparejado, fresco (`isFreshMatch`) | No | **No** | `restockFreshItem()` no usa lotes ni `expirationDate` en absoluto — solo marca el estado (suficiente/poco/nada). No hay campo que editar. |

Una línea sin nada editable (fresco emparejado) no lleva flecha de expandir — igual que hoy
ya no lleva selector de cantidad para ese mismo caso (`@if (!state.isFreshMatch(line))`).

## Cambios de datos

`ReceiptReviewLine` (`src/app/core/models/receipt/receipt.model.ts`) gana tres campos:
- `foodType: FoodType | null` — inicializado con `inferFoodType(rawName)` al construir la
  línea en `startScan()`, editable solo en líneas nuevas.
- `expirationDate: string | null` y `noExpiry: boolean` — inicializados con
  `resolveSuggestedExpiry(...)` al construir la línea, editables en líneas nuevas y
  emparejadas no-frescas.
- `expanded: boolean` — estado de acordeón, no persiste tras cerrar el modal (se resetea en
  `startScan()`/`close()` igual que el resto del estado de revisión).

Tres métodos nuevos en `PantryReceiptScanModalStateService`, mismo patrón que
`pantry-add-entries-base.ts` (`setEntryFoodType`/`setEntryDate`):
`toggleExpanded(id)`, `setLineFoodType(id, foodType)`, `setLineExpirationDate(id, date, noExpiry)`.

`submit()` deja de inferir a ciegas y usa el valor que ya vive en la línea (que arrancó igual
al inferido, pero puede haber sido corregido):
- Rama "nuevo": `buildAddItemPayload` ya acepta `foodType`/`expirationDate`/`noExpiry`/
  `inferExpiry: false` explícitos — el mismo mecanismo que ya usa el alta manual para no
  volver a inferir sobre un valor que el usuario ya vio y pudo tocar. Se pasan los tres desde
  la línea en vez de dejar que la función infiera de nuevo.
- Rama "emparejado, no fresco": el `addNewLot(...)` actual ya construye la fecha ahí mismo
  llamando a `resolveSuggestedExpiry` de nuevo — pasa a usar `line.expirationDate`/
  `line.noExpiry` en su lugar.
- Rama "emparejado, fresco": sin cambios, `restockFreshItem` no toca fecha.

## De paso, un bug de telemetría en el mismo método

`submit()` manda `has_expiry: false` fijo en el evento `PANTRY_ITEM_ADDED` (línea 356),
sin mirar si de verdad se puso fecha — dato de analítica incorrecto desde que existe este
flujo. Ya que este mismo commit toca esa rama del código, pasa a calcularse
`Boolean(expirationDate)` de verdad, igual que ya hacen `pantry-add-modal-state.service.ts`
y `pantry-fresh-add-modal-state.service.ts` para el mismo evento.

## Qué NO cambia

- El diálogo de renombrar (`editLineName`) y el parser de tickets (`core/domain/receipt`) —
  esto es puramente la UI de revisión sobre datos ya inferidos.
- El emparejamiento difuso (`matchReceiptName`) y sus umbrales.
- Ningún test de componente nuevo más allá de la convención del repo: el state service, si
  gana lógica no trivial que testear, sí; la plantilla, como el resto de `shared/components`
  y las demás modales de pantry, no.

## Verificación

- `npx ng lint`, `node scripts/check-icons.mjs`, tests, `npx ng build --configuration production`.
- Verificar en el navegador (los pasos de cámara/OCR reales son solo-APK, per `CLAUDE.md`):
  simular líneas de revisión con `ng.getComponent(...)` para cubrir los 3 casos (nuevo,
  emparejado no-fresco, emparejado fresco) y confirmar que cada uno expone exactamente los
  controles de la tabla de arriba.
- QA en dispositivo obligatoria antes de dar por cerrada la funcionalidad: escanear un ticket
  real, expandir/colapsar líneas, corregir un tipo y una fecha, confirmar que lo guardado
  refleja la corrección y no el valor inferido original.
