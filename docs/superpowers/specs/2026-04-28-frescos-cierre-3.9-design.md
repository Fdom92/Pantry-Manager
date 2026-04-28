# Diseño: Cierre de frescos 3.9

**Fecha:** 2026-04-28  
**Rama:** feat/fresh-products  
**Alcance:** 5 áreas de mejora sobre la feature de productos frescos para cerrar la versión 3.9

---

## 1. Modal de añadir fresco — simplificación

### Objetivo
Reducir el modal de añadir fresco a su esencia: seleccionar un producto y añadirlo. Sin fricción de cantidad ni fecha en el momento de añadir.

### Comportamiento actual
- El modal muestra entradas con ajustador de cantidad (±) por entrada.
- Muestra date picker y toggle "sin caducidad" por entrada.
- Tiene un toggle "Volver a comprar" (keepInStock) en el footer del selector.

### Comportamiento nuevo
- Al seleccionar un producto, entra en la lista de entradas mostrando solo el nombre.
- No hay ajustador de cantidad ni date picker por entrada.
- El toggle "Volver a comprar" se elimina del add modal (ya existe en el edit modal).
- Al hacer submit, el item se crea/actualiza con `quantity: 3` (Suficiente) automáticamente y sin fecha de caducidad.
- Si el usuario quiere ajustar estado o fecha, lo hace desde el edit modal.

### Cambios de implementación
- **`fresh-add-modal.component.html`**: Eliminar bindings `showEntryNoExpiry`, `(entryDateChange)`, `(entryNoExpiryToggle)`, `(adjustEntry)`. Eliminar el bloque `<div extras>` con el toggle.
- **`pantry-fresh-add-modal-state.service.ts`**: El método `submit()` ya hardcodea `quantity: 3` — no requiere cambios de lógica. Eliminar métodos `setEntryDate`, `setEntryNoExpiry`, `toggleKeepInStock` y la señal `keepInStock` (quedan huérfanos al eliminar los bindings del template).
- El entity selector modal ya tiene `[showMeta]="false"` en el add modal — confirmar durante implementación si esto ya oculta el ajustador de cantidad. Si no, añadir una prop `[showEntryQuantity]="false"` al entity selector modal.

---

## 2. Modal de editar fresco — UI al nivel del modal de despensa

### Objetivo
Unificar la experiencia visual del modal de editar fresco con el de editar despensa: cards blancas con sombra, inputs integrados dentro, mismo orden mental.

### Comportamiento actual
- El nombre está en un `ion-item lines="none"` suelto, sin card contenedora, con poco espacio inferior (la línea del input se ve cortada).
- Las secciones de Estado y Fecha son divs con label encima, sin card contenedora.
- El toggle de "Volver a comprar" está en un `ion-item` suelto.

### Comportamiento nuevo
Estructura en cards usando el patrón `.form-section` del modal de despensa:

| Card | Contenido |
|------|-----------|
| Card 1 | Input de nombre — mismo estilo que despensa (transparent bg, padding-start 0, línea inferior visible) |
| Card 2 | Selector de estado (sufficient / low / none) |
| Card 3 | Date chips (fecha de caducidad) |
| Card 4 | Toggle "Volver a comprar" |
| Danger zone | Convertir a despensa + Eliminar (ya existente, sin cambios) |

### Cambios de implementación
- **`fresh-edit-item-modal.component.html`**: Reestructurar usando `<div class="form-section">` alrededor de cada bloque. El `ion-item` del nombre pasa a tener `--background: transparent`, `--padding-start: 0`, `--inner-padding-end: 0` heredados del contenedor `.form-section ion-item` igual que despensa.
- **`fresh-edit-item-modal.component.scss`**: Eliminar las reglas ad-hoc de `__row` y `__section`. Añadir o reutilizar las clases `.form-section`, `.form-section-header` ya definidas en el global o en el componente de editar despensa.
- El `ion-item` del nombre pasa a `lines="none"` dentro de la `.form-section` card — los estilos del contenedor (`--background: transparent`, `--padding-start: 0`, `--inner-padding-end: 0`) dan el espacio necesario para que la barra inferior del `ion-input` se muestre completa, igual que en despensa.

---

## 3. Card de fresco — tratamiento del estado expirado

### Objetivo
Cuando un item fresco está caducado, la card debe comunicarlo con claridad sin que el color del estado compita. El segment de estado queda visible pero desactivado para indicar que hay que actuar (reponer o eliminar).

### Comportamiento actual
- El expiry label solo se muestra cuando hay urgencia (critical ≤1 día, warning ≤3 días).
- Cuando está caducado, el segment sigue teniendo sus colores activos (verde/amarillo/gris).
- El label "Caducado" y el color del estado compiten visualmente.

### Comportamiento nuevo

**Expiry label:**
- Siempre visible (quitar el `@if (expiryLabel())`).
- Cuando el estado es `expired`: texto rojo sólido, font-weight 600, font-size `0.8rem` (vs `0.75rem` del resto de estados).
- La zona `__info` recibe una `border-left: 3px solid` rojo cuando está expirada (barrita roja de acento izquierda).

**State segment cuando expirado:**
- Todos los botones tienen `disabled` attribute.
- Color de fondo activo → gris neutro (`var(--app-theme-text-subtle)` o similar), sin verde ni amarillo.
- `cursor: not-allowed` en los botones.
- `opacity: 0.6` en el segment completo para reforzar el estado inactivo.

**Estado no expirado:** igual que el diseño actual.

### Cambios de implementación
- **`fresh-item-card.component.html`**: Quitar `@if` del expiry label. Añadir `[attr.data-expired]="isExpired()"` en `__segment` y en `__info`. Añadir `[disabled]="isExpired()"` en cada botón del segment.
- **`fresh-item-card.component.ts`**: Añadir signal computada `isExpired()` basada en `daysToExpiry() !== null && daysToExpiry()! < 0`.
- **`fresh-item-card.component.scss`**: Añadir estilos para `[data-expired="true"]` en `__info` (border-left rojo) y en `__segment` (opacity + color override gris para el botón activo).

---

## 4. Ordenación de frescos — alfabética

### Objetivo
Eliminar el reordenamiento reactivo de frescos al cambiar el estado de un item. Orden estable y predecible.

### Comportamiento actual
Los frescos se ordenan por: `quantity desc → expirationDate asc`. Cambiar el estado mueve el item en la lista.

### Comportamiento nuevo
Ordenar por `name.localeCompare(b.name)` — igual que `compareItems` usa para los items de despensa dentro de cada grupo.

### Cambios de implementación
- **`pantry-state.service.ts`** — computed `freshItems`: reemplazar el comparador actual por `.sort((a, b) => a.name.localeCompare(b.name))`.
- No hay cambios en el domain ni en el store.

---

## 5. Despensa — toggle de agrupación por categorías

### Objetivo
La lista de despensa muestra por defecto una lista plana alfabética. El usuario puede activar la vista por categorías desde un control en el header de la sección.

### Comportamiento actual
La sección despensa siempre muestra los items agrupados por categoría (usando `groups()`).

### Comportamiento nuevo
- **Default**: lista plana de `despensaItems()` ordenada alfabéticamente.
- **Activado**: vista agrupada por categoría — comportamiento actual con `groups()`.
- El control es un botón icono en el header de la sección despensa (icono `list-outline` / `apps-outline` o similar) que alterna entre los dos modos.
- El estado **no persiste** entre sesiones (preferencia volátil de la sesión).

### Cambios de implementación

- **`PantryStateService`**: añadir `readonly groupByCategory = signal(false)`, método `toggleGroupByCategory()`, y `readonly flatDespensaItems = computed(() => [...this.despensaItems()].sort((a, b) => a.name.localeCompare(b.name)))`. Todo en el mismo servicio para mantener coherencia con `despensaItems` y `groups`.
- **`pantry.component.html`**: En el template de la sección despensa, usar `@if (state.groupByCategory()) { ... groups ... } @else { ... flatDespensaItems ... }`. Añadir botón icono en el header de la sección.
- **i18n**: Añadir keys `pantry.sections.despensa.groupToggle.byCategory` y `pantry.sections.despensa.groupToggle.flat` para el aria-label del botón.

---

## Archivos afectados (resumen)

| Archivo | Cambio |
|---------|--------|
| `features/pantry/components/fresh-add-modal/fresh-add-modal.component.html` | Eliminar bindings de cantidad/fecha/keepInStock |
| `core/services/pantry/modals/pantry-fresh-add-modal-state.service.ts` | Limpiar métodos huérfanos de fecha/keepInStock |
| `features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.html` | Reestructurar con form-section cards |
| `features/pantry/components/fresh-edit-item-modal/fresh-edit-item-modal.component.scss` | Adoptar estilos form-section, eliminar reglas ad-hoc |
| `features/pantry/components/fresh-item-card/fresh-item-card.component.html` | Expiry label siempre visible, disabled en segment expirado |
| `features/pantry/components/fresh-item-card/fresh-item-card.component.ts` | Añadir signal `isExpired()` |
| `features/pantry/components/fresh-item-card/fresh-item-card.component.scss` | Estilos expired: barrita roja, segment gris/disabled |
| `core/services/pantry/pantry-state.service.ts` | Sort frescos alfabético, signal `groupByCategory`, `flatDespensaItems` |
| `core/services/pantry/pantry-list-ui-state.service.ts` | `groupByCategory` signal y toggle (si se mueve aquí) |
| `features/pantry/pantry.component.html` | Toggle categorías en header despensa, bifurcación flat/grouped |
| `src/assets/i18n/*.json` | Keys aria-label toggle categorías |

---

## Fuera de alcance

- Persistencia del toggle de categorías en Settings.
- Filtros de frescos por estado en los chips de filtro existentes.
- Fecha de caducidad obligatoria en frescos.
