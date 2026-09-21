# 5.5 — Datos legibles y dos mejoras pequeñas

Fecha: 2026-09-15 (sustituye al diseño del 2026-09-14). Rama: `release/5.5`.

## Por qué esta versión es así

El 2026-09-14 el primer export de PostHog con algo de 5.4 enseñó que los datos
**no se pueden leer bien**:

- El móvil de Fernando (OnePlus CPH2493) aparecía como **tres usuarios reales**:
  la compra de tester, la reinstalación para probar la restauración y el QA de la
  5.4. La única compra PRO del periodo era de prueba. La causa: `markAsInternal()`
  solo existe en el panel de desarrollo, y cada reinstalación crea una persona
  nueva en PostHog.
- `notification_received` casi nunca puede emitirse. El plugin solo lo dispara con
  el WebView vivo (`LocalNotificationsPlugin.fireReceived()`), y una notificación
  de la mañana llega con el proceso de la app muerto.

Hay dos revisiones programadas: el **2026-10-02** y el **2026-10-23**. La del 23
decide hacia dónde va la 5.6. Esta versión tiene que salir en días, para que a
esa revisión le lleguen semanas de datos limpios. Por eso el alcance es pequeño a
propósito.

## Alcance

1. Origen de la instalación, enviado a PostHog.
2. Notificaciones entregadas, contadas en la bandeja.
3. Avería del plugin de notificaciones distinta de rechazo.
4. Orden de la despensa por caducidad.
5. Sección Frescos vacía en una línea.
6. Borrar código muerto del modal de consumir.
7. Lista de la compra: añadir a mano con la lista vacía.
8. Lista de la compra: acciones unificadas en un menú al tocar la fila, con "Ya no es básico".

Los puntos 7 y 8 salen del uso real de Fernando (añadidos el 2026-09-21).

**Fuera, para cuando haya datos:** ticket en varias fotos (a la 5.6, cuando la
revisión del 2 de octubre diga en qué paso se rompe el ticket para usuarios
reales; si es en otro paso, las varias fotos no lo arreglan); deshacer; el spec del scheduler y las carreras
H2/H3; source maps de Sentry; corregir DEV.md (ProGuard); tests en `features/`.
El diseño de todo eso sigue en la historia de git de este fichero (commit
`36d5edc5`).

## 1 — Origen de la instalación

Ningún plugin del proyecto expone de dónde vino el APK; revisados
`@capawesome/capacitor-app-update`, `@capacitor/app` y `@capacitor/device`. Hace
falta un **plugin nativo local**, el primero del repo:

- **Android:** clase `InstallSourcePlugin` junto a `MainActivity.java`, registrada
  con `registerPlugin` en `MainActivity`. Un único método, `getInstaller()`, que usa
  `PackageManager.getInstallSourceInfo(packageName).getInstallingPackageName()` en
  API 30+ y `getInstallerPackageName()` por debajo. Cualquier excepción devuelve
  `null`; nunca lanza.
- **Dominio:** `classifyInstallSource(installer: string | null)` en
  `core/domain/analytics/`, con spec:
  - `com.android.vending` → `'play'`
  - `null` o `com.google.android.packageinstaller` / `com.android.packageinstaller`
    / `com.android.shell` → `'sideload'`
  - cualquier otro valor → `'other'`
  - fuera de nativo o si el plugin falla → `'unknown'`
- **Envío:** `PersonProfile` gana `install_source`. Se calcula una vez por arranque
  y va con `syncPersonProfile()`, que ya corre al arrancar y en cada vuelta a primer
  plano.
- **Cómo se usa:** en PostHog se filtra `install_source = play`. No se toca
  `is_internal`: una sola fuente de verdad, y no depende de acordarse de marcar
  nada.

**Verificación:** el camino `sideload` se prueba con el APK de Android Studio en
el móvil. El camino `play` solo se puede probar publicando; vale la **pista de
pruebas internas de Play** antes de producción.

**Límite asumido:** si Fernando instala desde la pista de pruebas internas, sale
como `play`. Para eso sigue existiendo el filtro por modelo de dispositivo.

## 2 — Notificaciones entregadas

`LocalNotifications.getDeliveredNotifications()` existe en la versión instalada
del plugin (`definitions.d.ts:88`).

- En `CapacitorNotificationPlugin` se añade `getDelivered()`, que devuelve los ids
  y nunca lanza (lista vacía más `logger.warn` si falla).
- Evento nuevo **`notification_delivered_seen`**, con `count` y `ids`, emitido al
  arrancar y en cada vuelta a primer plano, **solo si `count > 0`**. Sin títulos ni
  cuerpos: los ids son números de programación, no contenido.
- **Es un mínimo, no un conteo exacto.** Las notificaciones tocadas o descartadas
  ya no están en la bandeja, y las que siguen se cuentan otra vez en cada apertura.
  El análisis tiene que deduplicar por usuario e id. Se documenta en el comentario
  del evento, como se hizo con `notification_received`.
- `notification_received` se queda como está, con un comentario que explica por
  qué casi nunca se emite.

## 3 — Avería del plugin ≠ rechazo

Confirmado leyendo el código: `checkPermission()` devuelve `'denied'` si el plugin
lanza (`capacitor-notification.plugin.ts:27`). Eso activa `isPermanentlyDenied()`,
y el scheduler apaga el interruptor del usuario sin avisar
(`notification-scheduler.service.ts:127-134`).

- `NotificationPermissionDisplay` gana `'unavailable'`.
- `checkPermission()` y `requestPermission()` pasan a devolver
  `'granted' | 'denied' | 'unavailable'` (`requestPermission()` hoy devuelve
  `boolean`). Sus `catch` llaman a `logger.error`, que llega a Sentry, y devuelven
  `'unavailable'`.
- `NotificationPermissionService.request()` sigue devolviendo `boolean` a sus
  llamadores (scheduler, hoja de reconsentimiento, panel de desarrollo), pero guarda
  el estado de tres valores: `'unavailable'` ya no se convierte en `'denied'`.
- El scheduler solo apaga el interruptor con `'denied'`. Con `'unavailable'` sale
  sin programar y sin tocar preferencias.
- `reconsent-prompt.service.ts:63-69` excluye `'unavailable'`, para no pedirle
  permiso a un plugin roto.
- El chip de estado del panel de desarrollo lo muestra sin cambios: ya imprime el
  valor tal cual.

**Tests:** spec de `CapacitorNotificationPlugin` con `LocalNotifications`
espiado, y del scheduler **solo en la rama del permiso** (con `'unavailable'` no
se guardan preferencias; con `'denied'` sí). El spec completo del scheduler queda
fuera.

## 4 — Orden por caducidad

Hoy la despensa se ordena solo alfabéticamente, y **en tres sitios**, no en uno:
`sortPantryItems` en `pantry-query.service.ts:304`, otra vez en
`PantryStateService.flatDespensaItems` (`localeCompare`), y otra dentro de cada
grupo en `PantryViewModelService.buildGroups` (`compareItems`). El orden se decide
en la consulta y **los otros dos dejan de reordenar**: conservan el orden de
entrada. Si no, el orden por caducidad no se vería nunca.

- **Dominio:** `sortPantryItems(items, mode: PantrySortMode)`, con
  `PantrySortMode = 'expiry' | 'alpha'`. Reglas de `'expiry'`:
  1. se ordena por `expirationDate`, que ya es la fecha más temprana con stock
     (`computeEarliestExpiryStock`), ascendente, así que los caducados quedan
     arriba solos;
  2. los que no tienen fecha, al final;
  3. los empates, alfabéticos, con el mismo `normalizeSearchField` de hoy.

  `'alpha'` mantiene exactamente el comportamiento actual. Con spec.
- **Estado:** signal `sortMode` en `PantryQueryService`, que ya es dueño de filtros
  y búsqueda, y entra en `recomputeFilteredProducts()`. Cambiarlo recalcula en
  memoria; no reinicia la paginación.
- **Persistencia:** `LocalStorageService.pantrySort` con una clave nueva en
  `storage.constants.ts`. **No en `AppPreferences`**: el `effect` del scheduler
  escucha `preferences()` y reprogramaría notificaciones en cada cambio de orden.
  Un valor desconocido en el almacenamiento vuelve a `'expiry'`.
- **Predeterminado:** `'expiry'` para todo el mundo, también quien ya tiene la app.
- **UI:** botón de icono en la cabecera de Despensa, junto al de agrupar y con la
  misma condición de visibilidad (`!pantryIsEmpty()`). Abre un action sheet de
  Ionic con las dos opciones y la activa marcada. Textos en los 6 idiomas; el icono
  nuevo se registra y pasa el check de iconos del CI.
- **Agrupado:** los grupos siguen el orden de `filteredProducts`, así que dentro de
  cada categoría también se ordena por caducidad. Se comprueba en el navegador.
- **Frescos:** no se toca; va por estado, no por fecha.
- **Analítica:** `pantry_sort_changed { mode }`, en la línea de
  `pantry_grouping_toggled`.
- **De paso:** `core/domain/README.md` dice que `sortPantryItems` "ordena por
  prioridad", lo cual es falso hoy. Se corrige.

## 5 — Frescos vacía en una línea

- `EmptyStateComponent` gana `@Input() inline = false`. En modo en línea: sin
  icono, sin tarjeta, sin relleno; solo el subtítulo en texto secundario.
- **El evento se conserva** porque sale de `ngOnInit()` del propio componente. Por
  eso no se sustituye por texto plano.
- Se aplica a los dos vacíos de Frescos (`pantry.fresh.emptyState.subtitle` y
  `pantry.fresh.empty.filters`) **sin cambiar las claves**, para que la comparación
  con los datos de la 5.4 siga valiendo.
- El salto de línea del subtítulo (`\n(suficiente, poco o nada)`) se muestra como
  espacio en modo en línea. Se verifica en el navegador en español y alemán.

## 6 — Código muerto

`PantryConsumeModalStateService.close()` y `PantryStateService.closeConsumeModal`
(`pantry-state.service.ts:310`): ninguno tiene llamadores. Se borran los dos, y el
comentario de `dismiss()` que menciona `close()` se ajusta.

## 7 — Añadir a mano con la lista vacía

Es un bug. La fila "añadir a mano" (`list.component.html:45-48`) está dentro del
`@else` del estado vacío (`:34-41`). Si no hay sugerencias, comprados, ignorados ni
manuales, solo se ve el estado vacío y **no hay forma de añadir nada**.

- La fila pasa a estar fuera de esa cadena de `@if`: se ve siempre que no esté
  cargando, y el estado vacío va debajo.
- **Texto del estado vacío que explica cómo se llena la lista.** Todo producto nuevo
  nace sin básico (`isBasic: undefined`, `pantry-builder.domain.ts:77`), incluidos
  los del onboarding, y la lista solo sugiere básicos. Para un usuario nuevo la lista
  está vacía siempre, y el texto actual no le dice por qué. `shopping.emptyState.autoHint`
  pasa a explicar las dos vías: marcar productos como básicos con la estrella (vuelven
  solos a la lista cuando se acaban o bajan del mínimo) y añadir a mano con la fila de
  arriba. En los 6 idiomas; la clave se mantiene.
- **Por qué importa:** en el export del 2026-09-14, 5 de los 11 usuarios nuevos reales
  abrieron la pestaña Lista en su primera sesión; lo más probable es que vieran una
  pantalla vacía sin forma de añadir nada.

## 8 — Acciones de la lista unificadas, con "Ya no es básico"

**El caso que lo destapó (Fernando, uso real):** el maíz era básico con mínimo 1. Se
acaba y sale en la lista, pero ya no se quiere tener siempre. No hay forma de
decirlo:

- La lista **solo sugiere productos básicos** (`shouldAutoAddToShoppingList`,
  `pantry-status.domain.ts:180`). Quitar el básico es exactamente "no me lo vuelvas
  a sugerir".
- En la despensa ya existe (la estrella, `toggleItemBasic`,
  `pantry-state.service.ts:552`), pero **un producto de despensa a 0 no se ve en la
  despensa** (`activeProducts` filtra por stock mayor que 0). El agotado solo existe
  en la lista, justo donde no se puede desmarcar.

**Al mirarlo, la lista tenía un problema más amplio:** tres gestos distintos, en dos
direcciones, y una sección sin salida.

| Fila | Hoy |
|---|---|
| Sugerencia automática | deslizar a la izquierda → ocultar por ahora |
| Manual | deslizar a la izquierda → borrar (rojo) |
| Comprado | deslizar **a la derecha** → devolver a la lista |
| Oculto | **nada**: solo se recupera saliendo de la pestaña |

Y el gesto no se descubre: Fernando, que conoce la app, no encontró el de ocultar.

### Regla nueva, para toda la lista

**El botón de la fila es la acción principal (comprar); tocar la fila abre un menú
con el resto.** Se quita `ion-item-sliding` de las cuatro clases de fila. La
despensa ya no usa deslizar, así que la app queda sin gestos ocultos.

| Fila | Botón | Tocar la fila → menú |
|---|---|---|
| Automática (despensa o fresco) | comprar (como hoy) | Ocultar por ahora · Ya no es básico · Cancelar |
| Manual | comprar (como hoy) | Quitar de la lista (destructiva) · Cancelar |
| Comprado | — | Devolver a la lista · Cancelar |
| Oculto | — | Volver a mostrar · Ya no es básico · Cancelar |

El botón de comprar no cambia: en despensa abre la hoja de cantidad y en frescos
compra directo (`list.component.ts:109-116`). Tocar el botón no abre el menú.

### Piezas

- **Dominio:** `listRowActions(kind)` en `core/domain/list/`, con
  `kind = 'auto' | 'manual' | 'bought' | 'hidden'`. Devuelve la lista ordenada de
  acciones (`'hide' | 'unbasic' | 'remove' | 'restore' | 'unhide'`) y cuál es
  destructiva. La tabla de arriba vive solo ahí. Con spec.
- **Dominio:** `setBasic(item, isBasic, nowIso)` en `core/domain/pantry/`, con la
  regla que hoy vive dentro de `toggleItemBasic` (quitar el básico borra
  `minThreshold`). La usan la estrella de la despensa y la lista. Con spec.
- **Estado (`ListStateService`):** `openRowActions(row)` pinta el menú con el
  `ActionSheetController` que el servicio ya inyecta para compartir, y despacha a:
  `removeAutoItem` (ya existe), `unbasicItem` (nuevo), `removeManualItem` (ya
  existe), `restoreFromBought` (ya existe) y `unhideAutoItem` (nuevo: quita el id de
  `removedAutoIds`).
- **"Ocultar por ahora"** mantiene su semántica: se olvida al salir de la pestaña.
  El texto del aviso ya lo dice ("volverá la próxima vez").
- **Aviso con deshacer para "Ya no es básico":** `ToastService.withAction(key,
  actionKey, handler)`, con `buttons` de Ionic y 5 s. "Deshacer" vuelve a marcar el
  básico **con el mínimo que tenía**. Es necesario porque un producto a 0 sin básico
  no aparece en ningún sitio hasta que se vuelve a añadir.
- **Plantilla:** las filas tienen feedback de pulsación (`pressable`, ya usado en la
  lista) para que se note que se pueden tocar.
- **Textos:** menú y avisos en `shopping.*`, en los 6 idiomas. La app nunca dice
  "básico" al usuario: la estrella se llama "Mantener siempre en casa"
  (`pantry.form.basic`). La acción del menú sigue ese vocabulario: "Ya no mantener
  siempre en casa".
- **Frescos:** la misma acción vale; también se sugieren solo si son básicos.

### Analítica

- `shopping_row_menu_opened { kind }`: si nadie lo abre, el problema pasa a ser que
  no se descubre, y se verá en los datos.
- `shopping_item_removed` (ya existe) gana `surface: 'menu'`.
- `shopping_basic_removed { kind, depleted }` y `shopping_basic_restored` al
  deshacer.

### Qué se pierde

El deslizar, para quien lo conociera. Con los datos actuales, prácticamente nadie.

## Riesgos

- **Primer código nativo propio.** Si `registerPlugin` falla, lo único que se
  pierde es el origen de la instalación (`'unknown'`), nunca el arranque. Se prueba
  en el APK antes de nada.
- **El camino `play` no se puede probar en local.** Pista de pruebas internas antes
  de producción.
- **Cambiar el orden por defecto es visible** para quien ya tiene la app. Se asume.
- **`notification_delivered_seen` sobrecuenta** entre aperturas. Documentado en el
  código y en la memoria del proyecto.

## Verificación antes de publicar

- `ng lint`, `ng test` y el check de iconos en verde (CI).
- Navegador: orden en plano y agrupado, persistencia tras recargar, Frescos vacía
  en `es` y `de`, sin errores de consola.
- Móvil con APK de Android Studio: `install_source: 'sideload'` en el perfil de
  PostHog; `notification_delivered_seen` tras dejar una notificación en la bandeja
  (el panel de desarrollo puede lanzarlas); onboarding, borrado y ticket siguen
  funcionando.
- Lista de la compra: con la lista vacía se puede añadir a mano y el texto explica
  cómo se llena; tocar cada una de las cuatro clases de fila abre su menú y ninguna
  se desliza; "Ya no es básico" saca el producto y no vuelve aunque se compre y se
  gaste; "Deshacer" lo devuelve con su mínimo; los ocultos se pueden volver a
  mostrar.
- Pista de pruebas internas de Play: `install_source: 'play'`.
