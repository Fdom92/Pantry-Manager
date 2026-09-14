# 5.5 — Calidad de vida, con las notificaciones como trabajo de fondo

Fecha: 2026-09-14. Rama: `release/5.5`, salida de `develop`.

## Por qué esta versión es así

La 5.4 se subió a Play el 2026-09-11. Lo primero que quedó apuntado para la 5.5
—leer el primer export de PostHog con datos de la 5.4— no se puede hacer
todavía: con unos 24 usuarios al mes, una muestra que sostenga una decisión
tarda entre dos y cuatro semanas, y a eso hay que sumarle la revisión de Play y
el despliegue.

La regla que dejó la 5.4 es mirar el export antes de diseñar, no después. Así
que la 5.5 no elige feature: hace dos mejoras de calidad de vida que no dependen
de ningún dato para justificarse, y arregla el subsistema que ahora mismo impide
leer bien lo que llegue.

Fecha objetivo del export: **2026-10-02**.

## Alcance

- A: orden de la despensa por caducidad.
- B: deshacer tras borrar y tras agotar.
- C: notificaciones — reproducir, fijar en specs y arreglar.
- D: limpieza menor de UI.

Fuera: el contenido de las notificaciones, los recordatorios de recuperación, el
deep link por producto y cualquier feature que dependa del export. Eso es la 5.6.

## A — Orden por caducidad

Hoy la despensa se ordena alfabéticamente y no hay alternativa
(`pantry-filtering.domain.ts:75`). En una app cuyo tema es la caducidad, lo que
vence mañana puede quedar el último de la lista.

**Dominio.** `sortPantryItems(items, mode)` recibe el modo: `'expiry'` o
`'alpha'`. Sigue siendo pura y lleva spec. Reglas de `'expiry'`:

1. Primero los caducados.
2. Después, fecha ascendente.
3. Sin fecha y marcados como que no caducan, al final.
4. Los empates se rompen alfabéticamente, para que el orden no baile entre
   recargas.

Se descarta un modo "recién añadido": `createdAt` existe en `BaseDoc`, pero
nada indica que nadie lo quiera.

**UI.** Botón de icono en la cabecera de Despensa, junto al de agrupar, que abre
una hoja con las dos opciones y una marca en la activa.

**Persistencia.** Clave nueva en `LocalStorageService`, al estilo de `manualList`
y `householdSize`. No va en `AppPreferences`: el `effect` del scheduler está
suscrito a `preferences()`, así que cada cambio de orden dispararía una
reprogramación de notificaciones y un evento `notification_scheduled` de más.

**Predeterminado.** `'expiry'` para todo el mundo, incluido quien ya tiene la
app. Se revierte en un toque.

**Frescos.** No se toca: esa sección va por estado, no por fecha.

**Analítica.** `pantry_sort_changed` con el modo. Quien vuelve al alfabético está
diciendo que el orden por caducidad no era lo que quería.

## B — Deshacer

No existe en ninguna parte del repo. De los 30 días de la 5.3 salieron 23
borrados frente a 19 ajustes de cantidad, y cada borrado se lleva por delante el
historial del que viven el waste tracker y los análisis.

**Alcance: borrar y agotar.** Son las dos acciones que destruyen datos. Consumir
de uno en uno se revierte con un toque en "+".

**Piezas:**

1. `ToastService.withAction(key, actionKey, handler)`, con `buttons` de Ionic y
   5 s de duración, frente a los 1,5 s de `success`. El servicio sigue siendo el
   único punto de presentación.
2. `UndoService`, de ámbito raíz, con una sola ranura: guarda la última
   operación reversible y la descarta al expirar. Una sola ranura evita tener
   que definir qué significa deshacer dos veces.
3. `PantryStoreService.restoreItem(doc)`. No sirve `addItem`, que busca
   candidato con el que fusionar (`pantry-store.service.ts:90-96`): restaurar
   podría acabar fundiendo el producto con otro. Hay que quitar el `_rev`, que
   quedó obsoleto al borrar; el spec lo cubre.
4. `HistoryEventLogService.removeEvent(id)`, y los `log*` del manager devuelven
   el evento creado. Deshacer borra también el evento que compensa, para que el
   registro no guarde un borrado que no ocurrió.

El waste tracker solo cuenta eventos `EXPIRE` (`waste.domain.ts:29`), así que
nada de esto lo altera.

**Analítica.** `undo_used` con la acción: es la medida directa de cuántos
borrados eran un accidente.

El aviso con "Deshacer" sustituye al `pantry.toasts.deleted` actual, que hoy solo
informa.

## C — Notificaciones

Regla de la sección: ningún arreglo entra sin verlo fallar antes, en el móvil o
en un spec. Lo que no se reproduzca se anota y no se toca.

**Confirmado leyendo el código.** `checkPermission()` devuelve `'denied'` cuando
el plugin falla (`capacitor-notification.plugin.ts:27`). Eso activa
`isPermanentlyDenied()`, y el scheduler apaga el interruptor del usuario sin
avisar y sin dejar rastro (`notification-scheduler.service.ts:127-134`). La app
no distingue una avería de un rechazo.

**Hipótesis, sin confirmar.**

- H2: `preferencesSignal` arranca con `DEFAULT_PREFERENCES`, que trae
  `notificationsEnabled: false`. Si el `effect` del constructor del scheduler se
  ejecuta antes de que carguen las preferencias reales, entra en la rama de
  desactivado y cancela la bienvenida, que se había programado a +5 min del
  onboarding. Solo afectaría a quien cierre y reabra la app en esos 5 minutos, y
  puede que ni eso: `permission.init()` hace dos esperas nativas antes de leer
  las preferencias.
- H3: la guarda `isScheduling` descarta la llamada que llega mientras otra está
  en marcha, en vez de encolarla. Además se evalúa sobre `loadedProducts()`, que
  `resetPagination()` vacía de forma transitoria.

**Paso 0, en el móvil, con build de depuración.** El panel de desarrollo solo
aparece con `!environment.production` (`settings.component.ts:73`), y es el que
lista las notificaciones pendientes.

1. Onboarding completo, cerrar la app del todo y abrirla antes de 5 min. ¿Sigue
   la `WELCOME` entre las pendientes? ¿Están las 7 proyectadas? (H2)
2. Arranque en frío con caducados en la despensa. ¿Salen 7 proyectadas con un
   contenido que cuadre? (H3)
3. Varias vueltas rápidas a primer plano. ¿Los pendientes siguen siendo
   coherentes?
4. En la misma sesión: el doble toque de la sección D.

**Spec nuevo: `notification-scheduler.service.spec.ts`.** Punto de entrada:
`spyOn(Capacitor, 'isNativePlatform')` más un espía de
`LocalNotifications.addListener`. Dobles de plugin, permiso, preferencias,
despensa y registro, siguiendo `welcome-notification.service.spec.ts`.

Reglas que fija, y que deben pasar ya:

- Una ganadora por día durante 7 días; gana la de mayor prioridad.
- Las definiciones desactivadas se saltan; un día sin ganadora no se programa.
- Con las preferencias desactivadas se cancela todo, bienvenida incluida.
- Con el permiso denegado de verdad, el interruptor pasa a `false`.
- El toque enruta bien, incluido el caso del `itemId` ya borrado.

Hipótesis, que deben fallar primero:

- H2: el `effect` con preferencias por defecto no cancela la bienvenida.
- H3: una llamada que llega durante otra se ejecuta al terminar, no se descarta.
- H4: si el plugin lanza, el interruptor no se apaga y se llama a
  `logger.error`.

**Arreglos.**

- H4, entra seguro: `NotificationPermissionDisplay` gana `'unavailable'`; el
  `catch` del plugin pasa a `logger.error` y devuelve ese estado; el scheduler
  solo apaga el interruptor con `'denied'`; `reconsent-prompt.service.ts:63-69`
  excluye también `'unavailable'`, para no pedirle permiso a un plugin roto; el
  chip del panel de desarrollo lo muestra.
- H2, solo si se reproduce: el scheduler ignora las ejecuciones hasta que las
  preferencias estén cargadas.
- H3, solo si se reproduce: la llamada que llega durante otra se guarda y se
  ejecuta una vez al terminar. Si además aparece la despensa vacía a mitad de
  una recarga, el scheduler lee de `pantryService.getAll()` en vez de la caché
  de la lista: las notificaciones no deberían depender del estado de la
  pantalla.

**Sin código, pero se anota:** `notification_scheduled` cuenta pasadas de
programación, no notificaciones, y se emite en cada arranque y cada vuelta a
primer plano con un `count` de hasta 7. "124 programadas, 0 tocadas" no se puede
leer como "124 ignoradas".

## D — Limpieza de UI

- `close()` del modal de consumir está muerto y arrastra a `closeConsumeModal`
  (`pantry-state.service.ts:310`), que no usa nadie. Se borran los dos.
- La sección Frescos vacía pasa a una línea de texto bajo la cabecera, sin
  tarjeta ni icono. El `+` de la cabecera sigue siendo la acción.
  `EmptyStateComponent` gana una variante en línea **en vez de sustituirse por
  texto plano**: el evento `empty_state_shown` sale del propio componente y usa
  `subtitleKey` como identificador, así que el texto plano perdería el evento. La
  clave no cambia, para que la comparación con los datos de la 5.4 siga valiendo.
- Comprobar en el móvil si "Añadir" y "Se ha acabado" piden dos toques. Si se
  reproduce, se investiga; si no, se cierra la nota del QA de la 5.4.

## Riesgos

- **El paso 0 puede no reproducir nada.** Es el resultado esperado en la mitad
  de los casos, y entonces H2 y H3 se quedan fuera. El spec del scheduler entra
  igual: hoy son 280 líneas sin una sola prueba.
- **Restaurar en PouchDB.** Volver a escribir un documento borrado con el `_rev`
  antiguo da conflicto. El spec de `restoreItem` tiene que cubrirlo.
- **Cambiar el orden por defecto es visible** para quien ya tiene la app. Se
  asume: es el tema de la app y se revierte en un toque.

## Verificación

- `ng lint` y `ng test` en verde; el CI ya corre los dos.
- Paso 0 en el móvil antes de escribir código de notificaciones.
- QA a mano en el móvil antes de publicar: la lección de la 5.3 es que ocho bugs
  reales salieron en un día de uso y ninguno lo cazó un test.
