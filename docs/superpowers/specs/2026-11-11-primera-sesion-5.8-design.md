# Primera sesión: el primer producto propio (5.8)

**Fecha:** 2026-11-11. **Versión:** 5.8 (rama `release/5.8`). **Sustituye** a
`2026-10-07-onboarding-activation-design.md`, que no llegó a implementarse.

## Por qué

Datos de PostHog (exports del 13-oct y del 2-nov, `install_source = 'play'`, internos fuera;
muestra pequeña, son señales):

- 40 de 52 usuarios reales usan la app un solo día.
- **Elegir básicos no predice volver; añadir un producto propio sí.** Seed ≥5 → vuelven 2 de
  17; seed 0–4 → 5 de 23. Añadir a mano el primer día → 7 de 17; sin añadir → 5 de 31
  (puede ser autoselección).
- Quien sale del onboarding con 0 básicos abre el modal de añadir y lo cierra sin escribir
  nada (4 de 4 en la 5.6, `pantry_add_modal_abandoned` con `entries: 0`).
- Causa probable, verificada en código: con la despensa vacía el autocompletado no sugiere
  nada. Sus opciones salen solo de `pantryStore.loadedProducts()`
  (`pantry-add-entries-base.ts`), así que el usuario nuevo ve un campo en blanco.
- El coach mark de añadir se cierra siempre en segundos.

La spec del 7-oct ponía como objetivo "≥5 productos con caducidad" y pre-marcaba 8 básicos:
se cumplía pulsando Continuar y no mide nada.

## Objetivo

**Activación = al menos un producto propio + notificaciones concedidas.** "Propio" significa
añadido uno a uno por el usuario: escrito, elegido entre las sugerencias o escaneado del
ticket. Un pre-marcado en bloque no cuenta, y en la 5.8 deja de existir.

La retención D1/D7 se sigue como referencia, no como objetivo de diseño.

## Fuera de alcance (a la 5.9)

Captura por foto con IA, cuota gratuita de IA y consentimiento antes de enviar datos al
servidor (van juntos: los tres dependen de un endpoint sin PRO). Emparejamiento del ticket y
ticket en varias fotos. Pantalla de mantenimiento, repaso por ubicación, búsqueda con
erratas. "Cociné esto". Hoja de cantidad acción→cantidad (pendiente de los datos de
`pantry_quick_action` de la 5.7). Sugerir el nombre genérico cuando se escribe una marca.

## 1. Flujo del onboarding y paso de alta

**Flujo:** `notifications → analytics → seed → confirm` pasa a `add → notifications → analytics`.

- `ONBOARDING_SLIDES` pierde `seed` y `confirm` y gana `add` en primera posición.
- Se quita el botón "Saltar" de la barra superior (`skipOnboarding` y su uso). Los dos pasos
  de permisos ya tienen "Más tarde"; el paso `add` tiene "Empezar vacío" al pie.

**Paso `add`** ("¿Qué tienes a mano ahora mismo?"):

- `app-entity-autocomplete` integrado en el slide (no un modal encima). Al enfocarlo muestra
  los 25 básicos de `ONBOARDING_QUICK_SEED_ITEMS`, traducidos y con emoji. Escribir filtra;
  si nada coincide, ofrece "Añadir «X»".
- Al elegir o escribir aparece una fila con nombre, tipo y fecha propuesta, editable con
  `app-food-type-picker` / `app-expiry-picker` / `quick-date-chips`.
  - **Básico elegido:** usa el `foodType`, el `productType` y el `alwaysNoExpiry` del básico.
    No se infiere del nombre traducido (eso dejaba "Œufs" y "Grão-de-bico" sin fecha).
  - **Nombre escrito:** `foodType` con `inferFoodType` y fecha con `resolveSuggestedExpiry`,
    igual que el alta normal. `productType: 'pantry'`, como el alta por defecto desde
    Despensa. Si es incorrecto, el usuario lo cambia al editar.
- Se pueden añadir varios productos, pero el texto anima a añadir uno. "Continuar" se activa
  con uno o más.
- "Empezar vacío" pasa al paso `notifications` sin guardar nada.
- Los productos se guardan al pulsar Continuar, no al terminar el onboarding. Así la vista
  previa de notificaciones ya los tiene y, si la app se cierra a mitad, el producto no se
  pierde.

**Paso `notifications`:** la vista previa usa el primer producto añadido, con el formato de
`DateDisplayService` (`appExpiry`; la clave i18n lleva el marco "{{name}} caduca {{when}}").
Si el usuario empezó vacío, se muestra el texto genérico actual.

**Guardado compartido:** la lógica de `bulkCreateSeedItems` (privada del onboarding) pasa a
un servicio raíz que recibe borradores ya resueltos (nombre, `foodType`, `productType`,
fecha o `noExpiry`). Construye con `buildAddItemPayload`, guarda con
`pantryStore.addItem` y registra con `historyManager.logAddNewItem`. Se borra el comentario
"never invent dates", que contradice al código. El `new Date()` del sello de tiempo pasa a
`ClockService.now()`.

**Al terminar:** se mantiene `scheduleAll()` y la navegación a `/pantry`.

## 2. Básicos como sugerencias en el alta normal

Afecta a los modales de añadir de Despensa y de Frescos (`PantryAddEntriesBase`).

- **Con el campo vacío al enfocar:** tus productos de esa mitad del catálogo, como hoy. Si no
  tienes ninguno, los básicos de esa mitad: `productType: 'pantry'` en Despensa y `'fresh'`
  en Frescos.
- **Al escribir:** primero tus productos que coinciden; después los básicos que coinciden y
  que no tienes ya. "Que no tienes ya" se compara por `normalizeProductKey` del nombre
  traducido, porque los productos sembrados en versiones anteriores no guardan de qué
  básico salieron.
- Los básicos se distinguen por el emoji y por no llevar cantidad.
- **Dominio:** función pura nueva en `core/domain/pantry`, escrita test-first, que recibe
  los productos propios de esa mitad, los básicos de esa mitad con su nombre traducido y la
  consulta, y devuelve las opciones en orden. La traducción la hace el servicio; el dominio
  no conoce Angular. El onboarding usa la misma función con los 25 básicos y sin productos
  propios.
- **Servicio:** las opciones pasan a ser una unión (producto propio | básico). `addEntry` hoy
  sale sin hacer nada si la opción no trae un `PantryItem` (`pantry-add-entries-base.ts`,
  `if (!item) return`). Con un básico, crea una entrada nueva como `addEntryFromQuery`, pero
  con el `foodType` del básico en lugar de inferirlo.
- El filtro de `app-entity-autocomplete` (subcadena sobre la clave normalizada) no cambia.

## 3. Estado vacío con acciones y retirada del coach mark

**Estado vacío** (mientras haya 0 productos):

- `app-empty-state` gana una acción secundaria: `secondaryActionLabel` + `secondaryAction`.
  No se crea `app-first-steps`.
- Acciones: "Añadir un producto" (principal) y "Escanear ticket" (secundaria).
- **Despensa** (`summary().total === 0`): deja de ser `inline` y llama a
  `facade.openAddModal()` y `facade.startReceiptScan()`.
- **Dashboard** (`totalItems() === 0`): navega a `/pantry?openAddModal=true` (el parámetro
  que ya existe) o a `/pantry?startReceiptScan=true` (nuevo). Despensa lee el parámetro
  nuevo en el mismo `ionViewWillEnter` y lo borra con `replaceUrl`, igual que
  `openAddModal`.
- Evento `first_steps_action` con `action` (`add` | `scan`) y `screen` (`dashboard` | `pantry`).

**Coach mark:** se retira solo `add-coach-mark` (componente y uso en `pantry.component.html`).
`CoachMarkStateService` y `localStorage.coachMark` se quedan: los usan la pista de la estrella
(`pantry:star`) y la del encuadre del ticket (`FRAMING_HINT_KEY`). Las constantes
`COACH_MARK_*` y las claves i18n `pantry.coachMark.*` solo se borran si un grep (en `.ts` y
`.html`) confirma que no quedan usos.

## 4. Medición

- **`onboarding_completed`** se emite ya después de la decisión sobre la analítica, así que
  resume lo que pasó antes de ella (los `onboarding_step_viewed` anteriores al
  consentimiento se pierden):
  - fuera: `seed_count`, `skipped`;
  - nuevas: `own_count`, `own_source` (`suggestion` | `typed`, el primer producto),
    `started_empty`, `last_step_index`;
  - se mantienen: `notif_granted`, `analytics_granted`.
  - `ONBOARDING_SKIPPED` deja de emitirse; la constante se borra si queda sin uso.
- **`activation_reached`**, una vez por instalación (`trackOnce`):
  - Condición: ≥1 producto en el store, permiso de notificaciones concedido, analítica activa
    y onboarding de la 5.8 completado.
  - Se evalúa con un `effect` en un servicio raíz pequeño, a partir de las señales del store
    y las preferencias. Si el consentimiento o el producto llegan después (desde el aviso de
    reconsentimiento, días más tarde), se emite entonces.
  - Al completar el onboarding de la 5.8 se guarda en `localStorage` una marca
    (`STORAGE_KEYS`). Los usuarios anteriores no la tienen y no emiten nunca, para no inflar
    la cifra.
  - Propiedades: `source` (`onboarding` | `suggestion` | `typed` | `receipt`, el origen del
    primer producto guardado tras el onboarding, en `localStorage`) y
    `minutes_since_onboarding`.
- Eventos nuevos en `ANALYTICS_EVENTS`, snake_case, propiedades planas.
- **Revisión:** 3–4 semanas después de publicar, en PostHog con `install_source = 'play'`.
  Pregunta: ¿qué parte de `onboarding_completed` tiene `own_count ≥ 1` y qué parte llega a
  `activation_reached`? La retención de Play sirve de referencia para quien no acepta la
  analítica.

## i18n

Claves nuevas en los 6 bundles: título, texto y "Empezar vacío" del paso `add`; vista previa
de notificaciones con producto; segunda acción del estado vacío; nuevos títulos de estado
vacío. Las claves de `seed`/`confirm` y `onboarding.actions.skip` solo se borran tras un grep
que confirme que no quedan usos. `onboarding.quickSeed.items.*` se mantiene (son los nombres
de los básicos). No se renombra ninguna clave.

## Otros de la 5.8 (sin spec, tareas sueltas del plan)

- RevenueCat código 2 (`STORE_PROBLEM`) en `getOfferings` → `logger.warn` (en compra sigue
  siendo error).
- `ndk { debugSymbolLevel 'SYMBOL_TABLE' }` en el release; compilar sin NDK instalado.
- Precarga del modelo OCR: verificar en un móvil limpio (instalar desde Play, modo avión,
  primer escaneo). Si funciona, quitar la frase de la landing.
- Capturas de la landing de Despensa e Insights.
- Toasts en el CPH2493: diagnóstico por USB con tiempo limitado a una sesión. Si no sale, se
  queda como está.

## Pruebas

- **Dominio (test-first):** construcción de opciones (vacío/con productos, mitad
  despensa/fresco, exclusión por nombre normalizado, orden); condición de activación como
  función pura (producto, permiso, consentimiento, marca).
- **Servicios:** `addEntry` con un básico crea una entrada con el `foodType` del básico; el
  servicio de guardado compartido (sello de `ClockService`, historial); propiedades de
  `onboarding_completed`; `activation_reached` una sola vez y solo con la marca.
- **Navegador (`npm start`):** onboarding entero en sus tres caminos (un básico, nombre
  escrito, empezar vacío); modal de añadir con la despensa vacía en Despensa y en Frescos;
  estado vacío de Despensa con sus dos acciones.
- **Antes de dar por hecha cada tarea:** lint, `check-icons`, tests y build de producción.

## Solo lo prueba un dispositivo

- Petición del permiso de notificaciones tras el paso `add`, y la vista previa con el producto.
- Dashboard vacío → Despensa con el modal abierto o el escaneo iniciado (`ionViewWillEnter`
  no se dispara en el servidor de desarrollo).
- Escaneo desde el estado vacío (cámara/OCR).
- Teclado y autofoco del campo dentro del slide (swiper + teclado de Android).
- Gesto atrás de Android durante el paso `add`.
