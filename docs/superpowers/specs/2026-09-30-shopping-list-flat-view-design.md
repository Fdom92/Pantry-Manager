# Lista de la compra — vista plana por defecto, con toggle a agrupada

**Fecha:** 2026-09-30. **Rama destino:** por decidir al escribir el plan (fuera de `release/5.6`,
ya fusionada). Origen: punto #10 de la segunda tanda de QA de Fernando, decisión tomada en esta
sesión de diseño.

## Por qué

Hoy la lista de la compra siempre agrupa por supermercado
(`ListStateService.shoppingAnalysis().groupedSuggestions`, `list.component.html:50-119`), sin
alternativa. Despensa ya resolvió el mismo dilema (agrupar por categoría vs. vista plana) con un
toggle — Fernando quiere el mismo patrón aquí, pero con la vista **plana como opción por
defecto** (al revés que Despensa, que arranca agrupada) y sin decidir a ciegas si merece la pena
mantener el agrupado: se añaden eventos para verlo con datos reales antes de invertir más en ello.

## Qué construimos

Copia casi literal del patrón ya existente en Despensa
(`PantryStateService.groupByCategory`/`toggleGroupByCategory`, `pantry.component.html:144-150`),
adaptado a la lista:

**Estado** — nuevo signal en `ListStateService`:
```ts
readonly groupBySupermarket = signal(false); // plano por defecto
toggleGroupBySupermarket(): void {
  this.groupBySupermarket.update(v => !v);
  this.analytics.track(ANALYTICS_EVENTS.SHOPPING_GROUPING_TOGGLED, { grouped: this.groupBySupermarket() });
}
```
No persiste entre visitas — igual que Despensa, se resetea a plano cada vez que se entra a la
pestaña. Si los datos muestran que la gente agrupa mucho, se añade persistencia en un pase
posterior con esa evidencia, no antes.

Nuevo evento `SHOPPING_GROUPING_TOGGLED: 'shopping_grouping_toggled'` en
`core/constants/analytics/events.constants.ts`, mismo payload que su equivalente de Despensa
(`PANTRY_GROUPING_TOGGLED`, `{ grouped: boolean }`) — permite comparar directamente cuánto se
agrupa en cada pantalla.

**Toggle visual** — un botón icono más en `ion-buttons slot="end"` del `ion-toolbar` de la lista
(junto a compartir/ajustes, mismo patrón de fila de iconos del header), no en el cuerpo de la
página como Despensa (la lista no tiene cabeceras de sección propias fuera del agrupado en sí).
Mismos iconos que Despensa (`list-outline`/`apps-outline`), oculto si no hay nada que agrupar
(`!state.summary.total`, evita mostrar un toggle sin efecto visible).

**Vista plana** — el dato ya existe sin cambios: `ShoppingState.suggestions` (`list.model.ts:48`)
es la lista de sugerencias SIN agrupar, ya calculada hoy dentro de `buildShoppingAnalysis` junto a
`groupedSuggestions` — no hace falta ninguna función de dominio nueva, solo renderizar ese array
en vez de `groupedSuggestions`. La plantilla, cuando `!facade.groupBySupermarket()`, sustituye el
bloque de `@for (group of state.groupedSuggestions; ...)` por dos `@for` seguidos sin cabecera de
grupo ni colapsable: uno sobre `state.suggestions` (misma fila `<ion-item class="suggestion-item"
...>` ya escrita hoy dentro de cada grupo, con su botón de comprar) y otro sobre
`facade.visibleManualItems()` (misma fila que ya usa el grupo sintético "sin asignar" hoy) —
copiando el markup de fila existente tal cual, sin inventar uno nuevo. Los manuales van siempre
después de las sugerencias automáticas, igual que hoy aparecen siempre en el grupo "sin asignar"
al final.

**Lo que NO cambia:**
- Las secciones globales "Comprado" e "Ignorados" (`list.component.html:162-207`) — no son parte
  del agrupado por supermercado, siguen exactamente igual en ambos modos.
- `collapsedGroups`/`toggleGroup`/`isGroupCollapsed` (colapsar un grupo concreto) — sigue
  existiendo tal cual para cuando se está en modo agrupado; en plano simplemente no se usa, no se
  toca su lógica.
- `groupSuggestionsBySupermarket()` y `buildShoppingAnalysis()` — cero cambios, ya calculan ambos
  formatos (plano y agrupado) a la vez.
- El campo `supermarket?: string` libre en los modelos — no se toca, no hace falta un enum fijo de
  supermercados para esto.

## i18n

Nuevas claves bajo `shopping.*` en las 6 bundles, mismo texto que Despensa pero adaptado al
contexto (agrupar por supermercado, no por categoría):
- `shopping.groupToggle.flat`: "Agrupar por supermercado" (aria-label cuando el toggle está en
  plano, i.e. lo que pasaría al pulsar)
- `shopping.groupToggle.grouped`: "Vista plana" (aria-label cuando está agrupado)

(Mismo patrón invertido que usa Despensa: el aria-label describe la acción del botón — "qué pasa
si lo pulso" — no el estado actual.)

## Verificación

- `npx ng lint`, `node scripts/check-icons.mjs` (iconos ya registrados, reutilizados de
  Despensa), tests, `npx ng build --configuration production`.
- Verificar en el navegador: lista con productos de al menos 2 supermercados distintos + algún
  manual sin supermercado — confirmar que arranca en plano, el toggle cambia a agrupado y
  viceversa, que "Comprado"/"Ignorados" no cambian de comportamiento, y que el toggle desaparece
  cuando la lista está vacía.
