# Onboarding orientado a activación

**Fecha:** 2026-10-07. **Versión objetivo:** 5.7 (la 5.6 está cerrada). Origen: el export de
PostHog de 30 días (`project_posthog_export_2026_10_06`) mostró que la mayoría de usuarios
entra, prueba y se va; 17 de 20 hacen una sola sesión y vuelven 3.

## Por qué

Lo que se vio en el export (24 usuarios reales de producción; una muestra pequeña, son
señales y no estadística):

- De 15 usuarios que terminan el onboarding, **8 salen con 0 productos** (eligen ninguno o
  pulsan "Saltar") y aterrizan en una app vacía.
- Los que eligen productos pasan 1–5 minutos explorando y se van; los cuatro que más
  eligieron (24, 22, 16, 16) tampoco vuelven. No se puede demostrar que el onboarding cause
  la retención, solo que una app vacía no tiene nada que enseñar: sin productos no hay
  alertas de caducidad, ni sugerencias, ni Insights.
- Quien llega vacío abre el modal de añadir y lo abandona a los 0,1 min (32 abandonos
  frente a 79 envíos en total); pulsa "escanear ticket" a los 0,8–2,6 min sin ticket a mano.
- El coach mark del primer producto se mostró 7 veces y se cerró 6 en menos de 6 segundos.
- El onboarding actual (`notifications → analytics → seed → confirm`) pide dos permisos
  antes de enseñar valor, y ningún producto viene marcado: Continuar sin tocar nada deja 0.
- Los pasos 0 y 1 son invisibles en PostHog (la analítica no está consentida hasta el
  slide 2): 9 de 24 usuarios no tienen ningún evento de onboarding.

## Objetivo

**Activación en la primera sesión**: el usuario sale con **al menos 5 productos suyos con
caducidad y las notificaciones concedidas**. Es lo que separa a los usuarios hoy, se mide
con lo que ya existe (`seed_count`, `notif_granted`, eventos de añadir) más un evento
nuevo, y es la condición para que cualquier motivo de retorno (la notificación "esto caduca
mañana") funcione. La retención a día 1 y 7 queda como medida de seguimiento, no como
objetivo de diseño: con esta muestra no se puede demostrar que mejore.

Los productos de arranque sí reciben una fecha estimada (el constructor la infiere por tipo
y nombre), así que quien los elige cumple el umbral.

## Parte 1 — Nuevo flujo (quien entra al onboarding)

Orden actual → nuevo:

`notifications → analytics → seed → confirm`  →  `seed → confirm → notifications → analytics`

1. **Productos** — título tipo "¿Qué tienes en casa?". **8 básicos vienen marcados**
   (`milk`, `eggs`, `bread`, `rice`, `pasta`, `tomato`, `banana`, `oliveOil`) de los 25 de
   `ONBOARDING_QUICK_SEED_ITEMS`; se desmarcan con un toque. El botón muestra el contador.
   El "Saltar" de la barra superior se quita en todos los slides; en este slide hay una
   opción discreta al pie, **"Empezar vacío"**.
2. **Confirmar** — sin cambios de contenido.
3. **Notificaciones** — la vista previa usa un producto recién elegido ("Tu yogur caduca
   mañana"), no un texto genérico. Aceptar / Más tarde, como hoy.
4. **Analítica** — última y más pequeña, una línea de consentimiento. Los slides de permisos
   ya tienen su "Más tarde", por eso desaparece el botón de saltar de arriba.

**Coste asumido en la medición:** con la analítica al final, quien no la acepte deja sin
medir todo el onboarding (hoy se pierden los pasos 0 y 1). Se compensa añadiendo
`last_step_index` a `onboarding_completed` (que ya lleva `seed_count`).

## Parte 2 — Estado vacío con acciones (quien sale con 0)

Hoy el Dashboard vacío muestra solo texto ("Añade productos desde la pestaña Despensa…") y la
Despensa vacía una línea pequeña, sin botón.

- Componente nuevo **`app-first-steps`** (en `src/app/shared`), visible en Dashboard y
  Despensa mientras haya 0 productos, con tres acciones grandes:
  - **"Elegir lo que tienes en casa"** — reabre la rejilla de básicos como hoja, reutilizando
    `OnboardingSeedGridComponent`.
  - **"Añadir un producto"** — el alta de siempre.
  - **"¿Tienes el ticket a mano? Escanéalo"** — la vía con más recompensa (muchos productos
    con una foto).
- Se **retira el coach mark** del primer producto (`add-coach-mark`): dos guías a la vez
  confunden y los datos dicen que no funciona. Si la retirada deja código huérfano
  (`CoachMarkStateService`, claves de storage), se limpia en el mismo cambio tras comprobar
  sus llamadores.
- La creación de productos de arranque hoy es privada del servicio del onboarding
  (`bulkCreateSeedItems`, page-scoped). Se extrae a un servicio compartido que usen el
  onboarding y la hoja. De paso se corrige su comentario, que dice "never invent dates" y
  contradice lo que el constructor hace con `foodType`.

## Parte 3 — Medición, pruebas y alcance

**Eventos** (planos, sin texto libre; constantes en `ANALYTICS_EVENTS`):

| Evento | Props | Cuándo |
|---|---|---|
| `activation_reached` | `items` (número) | Una vez por instalación, al cumplir el umbral |
| `first_steps_action` | `action` (`seed`/`add`/`scan`), `surface` (`dashboard`/`pantry`) | Al tocar una acción del estado vacío |
| `onboarding_completed` (existente) | + `last_step_index` | Como hoy |

`isActivated(items, notificationsGranted)` es una función pura de dominio con test; la marca
"ya activado" vive en `localStorage` y se evalúa cuando cambia la despensa.

**Pruebas (TDD donde se puede):** selección por defecto (las 8 existen en la lista y están
marcadas), `isActivated` (casos límite: 4 vs 5 productos, sin permiso, productos sin
caducidad), visibilidad de `app-first-steps` (0 productos sí, filtro vacío no). Los
componentes no se montan en los tests: se comprueban con el build de producción y en el
navegador. **Solo en dispositivo:** permiso real de notificaciones, flujo con teclado y
cámara en el estado vacío.

**i18n:** claves nuevas en los 6 idiomas; `onboarding.actions.skip` se sustituye por
`onboarding.actions.startEmpty` y se eliminan las huérfanas; no se renombra ninguna clave
existente que use analítica.

**Riesgo principal:** que los 8 pre-marcados llenen la despensa de cosas que el usuario no
tiene. Mitigación: el slide de confirmar y el desmarcado de un toque. Se vigila comparando
`seed_count` con los borrados de la primera sesión (`pantry_delete_intent_resolved`).

## Qué NO se hace

- El match de productos del ticket (queda para la 5.7 por separado).
- Despensa de ejemplo con datos falsos en el almacenamiento real: contamina Insights y
  analítica y choca con "nunca inventar datos del usuario".
- Cambios al Dashboard con datos, ni nuevos ganchos de retención.
- Rediseño visual de las ilustraciones del onboarding.

## Verificación

`npx ng lint`, `node scripts/check-icons.mjs`, tests, `npx ng build --configuration production`;
el onboarding completo y el estado vacío en el navegador (`npm start`, onboarding reseteado
desde el panel de desarrollo). Lista para QA en dispositivo: permiso de notificaciones real,
alta con teclado, escaneo desde el estado vacío, vuelta tras cerrar la app a mitad del
onboarding.
