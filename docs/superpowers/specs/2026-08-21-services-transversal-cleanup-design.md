# Limpieza transversal de la capa `services` (v5.3)

Branch: `feat/services-cleanup-5.3` (desde `develop`)

## Contexto

Auditoría completa de `src/app/core/services` — 82 ficheros, 12.459 líneas — hecha al
arrancar la 5.3. Aparecen dos clases de deuda:

- **Transversal**: el mismo defecto repetido en toda la capa (logging, toasts, código
  dev en producción, fósiles). ~900 líneas, riesgo bajo, borrado o centralización.
- **Estructural**: la pila de cuatro capas de pantry, la fachada de 65 señales y los
  9 servicios de modal sin base común. ~5.000 líneas, riesgo alto, toca la pantalla
  más usada de la app.

**Este spec cubre solo lo transversal.** Lo estructural queda documentado al final
como deuda conocida, sin fecha.

El hallazgo que motiva la prioridad es T1: la app paga Sentry desde la 4.6 y no ve
ninguno de los fallos que captura en sus `catch`.

## Objetivo

Que un fallo capturado sea visible, que un aviso al usuario se escriba en un solo
sitio, que el código de desarrollo no viaje al usuario, y que lo muerto no ocupe.

---

## T1 — `LoggerService` como único canal, con salida a Sentry

### Problema

`LoggerService` (95 loc, dev-gated, prefijado) tiene **3 consumidores**:
`storage.service.ts`, `app-update.service.ts`, `analytics.service.ts`. Frente a eso hay
**73 llamadas a `console.log/warn/error`** repartidas por `src/app` —
`upgrade-revenuecat.service.ts` 15, `settings-state.service.ts` 6, `pantry-store.service.ts` 5,
`share.service.ts` 4, `pantry-fresh-edit-modal-state.service.ts` 4.

Sentry se inicializa en `main.ts:33` con `integrations: [browserTracingIntegration()]`
— sin `captureConsoleIntegration`. Consecuencia: cada `catch { console.error(...) }`
es un fallo que el usuario sufre y que **no existe en el crash reporting**.

### Diseño

Firma nueva, con ámbito explícito para que Sentry agrupe y filtre:

```ts
error(scope: string, message: string, err?: unknown, extra?: Record<string, unknown>): void
warn(scope: string, message: string, extra?: Record<string, unknown>): void
```

- `error()` escribe en consola **y** llama a
  `Sentry.captureException(err instanceof Error ? err : new Error(message), { tags: { scope }, extra })`.
- `warn()` **no** genera evento: deja un `Sentry.addBreadcrumb({ level: 'warning', category: scope, message })`.
  Viaja adjunto al siguiente error y da contexto sin gastar cuota.
- `log/debug/info/time/timeEnd/group/groupEnd` se quedan igual, solo dev.
- Muere el `if/else` de `error()`, cuyas dos ramas son hoy idénticas
  (`logger.service.ts:52-57`).

**Consentimiento: no hay nada que añadir.** El `beforeSend` de `main.ts:24` filtra
*todos* los eventos leyendo `STORAGE_KEYS.ERROR_REPORTING_ENABLED`, así que
`captureException` hereda el gate que ya existe. Los breadcrumbs no son eventos y solo
se envían adjuntos a uno que haya pasado el filtro.

### Alcance de la migración

Los 73 puntos de `src/app`, de forma mecánica:

```ts
// antes
console.error('[ListStateService] markAsBought failed', err);
// después
this.logger.error('ListStateService', 'markAsBought failed', err);
```

`main.ts` conserva `console` — se ejecuta antes del bootstrap de Angular y ahí no hay
inyector.

**Regla de la migración: se cambia la llamada y nada más.** El riesgo real de editar 73
`catch` no es el log, es alterar el flujo de recuperación por accidente.

---

## T2 — `ToastService`

### Problema

52 apariciones de `ToastController` en 13 ficheros, sin servicio que las centralice.
Cada punto repite `create({ message, duration, position }) + present()`, casi siempre
precedido de un `translate.instant`. Las duraciones ya divergieron sin criterio: 1200,
1500, 1800, 2000, 2500 y 3000 ms. Todos los toasts son `position: 'bottom'`; hay un
único `color: 'warning'`.

### Diseño

Nuevo `core/services/shared/toast.service.ts`, `providedIn: 'root'`:

```ts
success(key: string, params?: Record<string, unknown>): void   // 1500 ms
info(key: string, params?: Record<string, unknown>): void      // 2000 ms
error(key: string, params?: Record<string, unknown>): void     // 3000 ms, color 'danger'
raw(message: string, opts?: { duration?: number }): void        // mensaje ya construido
```

- Traduce dentro con `TranslateService`; el llamante pasa clave i18n, no texto.
- `position: 'bottom'` fijo.
- No devuelve promesa que el llamante deba esperar (hoy la mitad de los sitios hace
  `void toast.present()` y la otra mitad `await`).
- `raw()` existe para los pocos mensajes que se construyen concatenando.

Migran los 20 puntos de presentación; 13 ficheros pierden la dependencia de
`ToastController`. El único `color: 'warning'` vivo se revisa en su sitio y cae en
`info` o en `error` según lo que comunique.

---

## T3 — Código de desarrollo fuera del bundle de producción

### Problema

`DevMarketingSeederService` son **712 líneas** — el fichero más grande de toda la capa —
con nombres de producto en 6 idiomas para generar capturas de tienda. Se inyecta
incondicionalmente en `settings.component.ts:89`; el flag `isDev` (línea 97) solo
esconde el botón en la plantilla, pero el árbol de dependencias ya lo arrastró al bundle.

`NotificationSchedulerService` (361 loc) lleva ~110 líneas en 4 métodos marcados
"Dev-only": `scheduleNotificationAtTime`, `previewNextNotification`,
`scheduleTestNotification` y `fireDefinitionInFiveSeconds`. Los dos primeros de acción
son **idénticos salvo la hora de disparo**.

### Diseño

- El seeder deja de inyectarse. El handler de `SettingsComponent`, dentro de la rama
  `isDev` que ya existe, hace `await import(...)` y obtiene la instancia del `Injector`
  (`providedIn: 'root'` la crea perezosamente).
- Los 4 métodos dev del scheduler salen a un `DevNotificationsService` nuevo en
  `core/services/dev/`, cargado con el mismo mecanismo desde
  `SettingsNotificationsDevStateService`.
- Al moverlos, `scheduleTestNotification` y `scheduleNotificationAtTime` se funden en
  `fireWinning(at: Date)` — misma lógica, la hora como parámetro.
- `NotificationSchedulerService` baja a ~250 líneas y se queda solo con producción.

Efecto: ambos salen del bundle inicial y quedan como chunk perezoso que en producción
nadie descarga. Se mide con `ng build --configuration production --stats-json`,
comparando antes y después.

Si el chunk resultara molesto en el AAB, la exclusión real vía `fileReplacements` en
`angular.json` (donde ya hay uno para `environment`) queda como paso siguiente. No se
hace por adelantado: obliga a mantener un stub sincronizado con la interfaz.

---

## T4 — Borrados

| Qué | Dónde | Nota |
|---|---|---|
| `NetworkService` (44 loc) | `shared/network.service.ts` + export en `shared/index.ts` | **Cero consumidores** en todo el repo |
| `canUseAgent()` y `canUseAgent$` | `upgrade-revenuecat.service.ts:17,29` | Fósil de la feature agent, borrada en la 4.4 |
| `canUseAgent` | `tabs-state.service.ts:17` | Verificar antes que ninguna plantilla lo consuma |
| 3 × `const normalized` sin usar | `catalog-options.service.ts:22,43,64` | Variables muertas |
| `ConfirmService` sobre `window.confirm` | `shared/confirm.service.ts` | Ver abajo |

### `window.confirm` → `ion-alert`

`ConfirmService` envuelve `window.confirm`: un diálogo de navegador dentro de una app
Ionic, que además bloquea el hilo del WebView. Tres llamantes, los tres en flujos
destructivos:

| Llamante | Flujo | Clave del mensaje |
|---|---|---|
| `pantry-list-ui-state.service.ts:93` | Borrar producto | `pantry.confirmDelete` |
| `settings-state.service.ts:59` | Resetear datos de la aplicación | `settings.reset.confirm` |
| `settings-state.service.ts:127` | Importar backup (sobrescribe todo) | `settings.import.confirm` |

Pasa a `AlertController` y a ser `async`. Los tres llamantes están ya dentro de métodos
async — `submitImportFileSelection` incluso hace `await` sobre el booleano síncrono
actual — así que el cambio no propaga.

Los mensajes ya están traducidos. Para los botones: `common.actions.cancel` y
`common.actions.delete` **ya existen** en los 6 idiomas; falta añadir
`common.actions.confirm` para los dos diálogos de ajustes, donde "Eliminar" no es la
palabra correcta.

Es el único cambio de T4 visible para el usuario: esos tres diálogos cambian de aspecto.

### Duraciones de toast

Las 6 duraciones arbitrarias colapsan a las 3 del servicio nuevo al migrar T2.

---

## Verificación

La lección de la 5.2, confirmada cinco veces, es que estos fallos no los caza el test
suite: salen ejecutando la app.

**Red de regresión existente.** La capa de dominio no se toca en ningún punto de este
spec, así que sus 641 tests siguen siendo válidos y deben pasar sin modificación.

**Specs nuevos:**

- `logger.service.spec.ts` — que `error()` llama a `captureException` con el tag `scope`;
  que `warn()` deja breadcrumb y **no** genera evento; que `log/debug/info` callan en prod.
- `toast.service.spec.ts` — duración y color por tipo; que traduce con interpolación de
  parámetros; que `raw()` no pasa por el traductor.

**QA manual en dispositivo** (obligatoria, no opcional):

1. Borrar un producto → nuevo diálogo Ionic, confirmar y cancelar.
2. Resetear datos de la aplicación → nuevo diálogo, confirmar y cancelar.
3. Importar un backup → nuevo diálogo, confirmar y cancelar; verificar que los datos
   se restauran.
4. Provocar un toast de cada tipo (guardar, error de compartir, alta múltiple).
5. Panel dev de notificaciones: disparar la ganadora, una definición concreta, la de
   bienvenida, cancelar todas.
6. Seeder de marketing en build de desarrollo.
7. Comprobar en el proyecto Sentry de dev que llega un evento de un `catch` real.

**Medición de bundle:** tamaño del bundle inicial antes y después de T3.

---

## Riesgos

1. **73 ediciones mecánicas.** El peligro no es el log sino tocar sin querer el flujo de
   un `catch`. Mitigación: cambiar la llamada y nada más; revisar el diff fichero a
   fichero buscando cualquier cambio que no sea la línea de log.
2. **Volumen en Sentry.** Van a empezar a llegar fallos hoy invisibles — es el objetivo,
   pero puede comerse la cuota gratuita. Revisar a las 48 h de publicar y silenciar lo
   ruidoso antes de que tire eventos útiles.
3. **Cambio visible de diálogos.** Borrar producto, resetear datos e importar backup
   cambian de aspecto. Es una mejora, pero los tres son flujos destructivos: probar
   confirmar *y* cancelar en cada uno.
4. **Carga dinámica del seeder.** Si el import falla solo se rompe en desarrollo, pero
   se rompe la herramienta de capturas. Probar antes de cerrar la rama.

---

## Fuera de alcance

Los cuatro bloques son independientes entre sí y cada uno puede mergearse por separado.

**Deuda estructural documentada, sin fecha** (medida en la misma auditoría):

- **E1 — Pantry: cuatro capas sin frontera** (5.098 loc). `PantryService` (219) →
  `PantryQueryService` (380) → `PantryStoreService` (272) → `PantryStateService` (542).
  El Store delega 7 métodos línea a línea al Query y expone 6 helpers de dominio de los
  que `getItemEarliestExpiry` y `getItemBatches` tienen **0 usos**. Los consumidores
  entran por niveles distintos: 17 por Store, 8 por Query.
- **E2 — `ListStateService` (623 loc) son tres servicios.** ~250 líneas de generación de
  PDF sin estado (`buildShoppingPdf`, `drawPdfHeader`, `loadIconDataUrl`) y ~90 de
  `buildShoppingAnalysis`, lógica pura que pertenece a `core/domain/list` con tests.
  `markAsBought` y `markManualAsBought` duplican la bifurcación fresco-vs-lote.
- **E3 — Catálogos escritos tres veces.** `SettingsCatalogsStateService` (416 loc)
  triplica señales y métodos públicos para location/category/supermarket, mientras sus
  privados **ya están parametrizados por `CatalogKind`**. `CatalogOptionsService` repite
  el mismo copy-paste, y `SettingsPreferencesService` añade tres `ensureXOptions`.
- **E4 — 9 servicios de modal sin base común.** `PantryEditModalBase` son 12 líneas. Add
  y fresh-add reimplementan el mismo motor de entradas por separado. Cada modal usa su
  propio verbo: `openAddModal` / `open` / `openEdit` / `openQuantitySheet`.

Bien factorizado, no tocar: `notifications/definitions` (registry + definiciones),
`shared/local-storage.service.ts`, `shared/storage.service.ts`, `retention/`, `analytics/`.

---

## Decisiones tomadas durante la ejecución

**Las duraciones se quedan en tres cubos, sin excepciones** (2026-08-24). La
revisión de las tareas 5 y 6 señaló cuatro mensajes que pierden tiempo de
lectura al colapsar: `shopping.toasts.bought` (2500 → 1500, dos frases con el
nombre interpolado, y es la acción más frecuente de la app),
`pantry.fresh.toast.markedOutHint` (2500 → 1500, es una instrucción y era la
única rama con duración larga en el código viejo), `batchEdit.toast.updated_other`
(2500 → 1500) y `pantry.receiptScan.smartScanFallback` (3000 → 2000, y además
pierde su `color: 'warning'`, que avisaba a un usuario PRO de que su escaneo se
degradó). Se ofreció un cuarto método `hint()` a 2500 ms y se declinó: tres
cubos es lo que dice el spec y 1500 ms es lo que ya tenían la mayoría de las
confirmaciones. Reabrirlo necesita evidencia de uso, no otro argumento.

**Corrección medida sobre T3** (2026-08-24). El spec afirmaba que
`DevMarketingSeederService` "entra en el bundle de producción" porque se inyectaba
incondicionalmente. Es falso en el sentido que importa: la ruta `/settings` ya era
lazy, así que el seeder vivía en el chunk de ajustes, no en el inicial. Sacarlo con
`await import()` lo mueve de un chunk perezoso a otro propio.

Medición real, `ng build --configuration production`, `develop` contra la rama:

| | develop | rama | delta |
|---|---|---|---|
| Bundle inicial (crudo) | 2,38 MB | 2,36 MB | −20 kB |
| Bundle inicial (transferido) | 541,48 kB | 543,80 kB | **+2,3 kB** |
| Suma de todo el JS emitido | 4.560.850 B | 4.546.186 B | −14,3 kB |

El inicial comprimido sube ligeramente por cómo reparte esbuild los chunks. La
reducción neta de JS (−14 kB) viene de los borrados de T4 y de las 110 líneas dev
que salen del scheduler, no del seeder. Si algún día se quiere que el seeder no
viaje **en absoluto**, hace falta la exclusión por `fileReplacements` que el spec
dejó como paso siguiente — el import dinámico no la sustituye.

**Sin cabecera en los diálogos de confirmación** (2026-08-24). La revisión propuso
añadir `header` a las alertas de resetear datos e importar copia, porque
`window.confirm` traía el marco del navegador gratis. Se declinó: el cuerpo de los
tres mensajes ya enuncia la consecuencia y hace la pregunta ("Esta acción no se
puede deshacer. ¿Quieres continuar?"), y una cabecera repetiría lo mismo con menos
palabras. No hay claves de título para reutilizar, así que añadirla costaría copy
nuevo en 6 idiomas para no decir nada nuevo.

---

## Cierre de la auditoría (2026-08-25)

Las siete fases del informe se ejecutaron en la 5.3, salvo cuatro decisiones
tomadas contra el propio informe. Cada una se midió antes de descartarla.

**Hecho:** CI con lint y tests, las 16 violaciones de frontera, borrado del
código muerto con el detector re-ejecutado hasta converger en cero, catálogos y
motor de alta parametrizados, `logExpiredBatches` y el análisis de la compra a
dominio con tests, `extractIsPro` tipada, panel dev fuera de Ajustes, registro de
iconos fuera de `main.ts`, los wrappers y delegaciones del Store, los reexportes
de señal sin lector, y una sola convención de verbos en los nueve modales.

**No hecho, con motivo:**

1. **Fundir Store y Query.** Al contar los llamantes resultó que no son dos capas
   sobre lo mismo: el Store da estado derivado y mutaciones, Query da datos y
   pipeline, y cada uno tiene su público. Lo que sobraba eran los wrappers y las
   seis delegaciones, y eso sí se quitó. Fundirlos daba un servicio de 600 líneas
   sin resolver nada.

2. **Los 12 tokens SCSS "sin uso".** Cada uno es un escalón de una escala cerrada
   y documentada — `spacing` se declara a sí misma "14-step scale (2px → 48px)".
   Borrar los escalones libres deja huecos en un vocabulario e invita a escribir
   `40px` a mano.

3. **`@capacitor/keyboard` y `@capacitor/browser`.** Se probó de verdad: se
   desinstalaron, `cap sync`, y el proyecto nativo **compila sin ellos**. Pero el
   APK de debug no mide nada (sin ellos 23,8 MB, con ellos 21,4 MB: ruido de
   dexado incremental sin R8), y `keyboard` no es inerte aunque no se importe en
   JS — es lo que redimensiona el WebView al abrir el teclado, y eso cambia el
   comportamiento de los formularios solo en dispositivo. Beneficio no medible
   contra riesgo que únicamente se ve en el móvil.

4. **`pantry-view-model.service.ts` (573 líneas).** El informe lo marcó P2
   "quizá dividir". Es presentación cohesionada de una sola pantalla y depende de
   locale, así que no baja a dominio tal cual; partirlo por tamaño añadiría
   ficheros sin quitar complejidad.

## El plugin de TypeScript, ya cargado (4329b8d)

Era la primera deuda de la lista de abajo y se cerró antes de publicar. `ng lint`
extendía solo `@angular-eslint`, de modo que ninguna regla veía el TypeScript
dentro del fichero. Al cargar `plugin:@typescript-eslint/recommended` salieron 24
errores: 22 símbolos importados que ya no usaba nadie, un `prefer-const` y un
`no-unused-expressions`.

Lo revelador es de dónde venían ocho de esos huérfanos: de `81d7d22`, un commit
de esta misma rama. Quitar los wrappers de dominio de `pantry-store.service.ts`
dejó sus imports en pie y el lint de entonces no podía verlo. Una rama que se
dedica a limpiar generaba basura que su propia red no atrapaba.

`no-explicit-any` queda en **warning, no en error**. Los 18 restantes son bordes
de librerías sin tipos (PouchDB, plugins de Capacitor, la respuesta del LLM);
ponerlos en rojo o bloquea el CI o empuja a taparlos con un tipo peor. Como
warning siguen a la vista. Los specs lo desactivan del todo: un doble de test
puede mentir sobre su tipo, es su trabajo.

Los dos hallazgos que no eran imports eran código de verdad: un ternario usado
como sentencia en `list.component.ts` (la intención era alternar, ahora lo dice)
y un `let { quantity, nameTokens }` en el parser de tickets donde solo `quantity`
se reasigna.

**Deuda que la auditoría destapó y sigue viva:** `NotificationSchedulerService` se quedó sin cobertura al mover sus métodos
dev; `features/` y `shared/` siguen sin un solo spec; y `restore()` se llama en
cada primer plano, que ahora que funciona hace una ida y vuelta real a la tienda.

**Nota de entorno descubierta de paso:** el build nativo falla con `./gradlew` a
secas porque no hay JDK 21 en el PATH. Funciona con
`JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.

## QA manual sobre la rama ya "verde" (2026-08-26)

Con `ng lint` en cero, 709 tests en verde y el build de producción hecho,
veinte minutos de usar la app en el dev server destaparon tres cosas. Ninguna
la podía ver el pipeline:

1. **`flag-outline` sin registrar.** Lo dejó caer esta misma rama al extraer el
   panel de dev a su propio componente. Ionicons resuelve los nombres en
   runtime: el icono no se pinta, avisa solo por consola, y pasa lint, tests y
   build sin despeinarse. Ahora hay un script en el CI que lo caza, validado
   quitando la registración y comprobando que falla.
2. **Tres errores falsos en Sentry por carga.** RevenueCat es native-only y en
   web rechaza con "Web not supported in this plugin". Iba por `logger.error`,
   que hace `captureException`. Una condición esperada generando eventos —
   exactamente el ruido que entrena a ignorar los errores de ese servicio.
   Los otros seis servicios native-only ya se guardaban con
   `Capacitor.isNativePlatform()`; RevenueCat era el único que no.
3. **El chip de tipo, ausente en la hoja de alta de frescos.** El hint decía
   que la fecha sale del tipo de alimento —y es literalmente cierto,
   `resolveSuggestedExpiry` cae a `inferFoodType(name)`— pero el tipo era
   invisible e incorregible. No era diseño: el modal de *editar* fresco sí
   tenía el picker.

**El mismo patrón que en la 5.2, otra vez.** Los tres salieron de ejecutar la
app, ninguno de un test. Y el tercero lo encontró el usuario, no yo: yo había
escrito en el docblock de `PantryAddEntriesBase` que "despensa lleva tipo de
alimento y fresco no", codificando el hueco como si fuera una decisión. Merece
la pena desconfiar de los docblocks que explican por qué algo está incompleto.

Efecto colateral que sí funcionó: al mover `decorateEntry` y `setEntryFoodType`
a la clase base, el plugin de TypeScript recién cargado cazó al instante los
tres imports que quedaban huérfanos en la subclase.
