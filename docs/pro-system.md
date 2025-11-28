# Sistema PRO

## Visión general
- El estado PRO se gestiona en el frontend con `ProStatusService` (`src/app/core/pro/pro-status.service.ts`). Guarda el estado en Capacitor Preferences (`pro:status`) y expone métodos síncronos (`isPro`) y reactivos (`isPro$`, `statusChanged`).
- Al arrancar la app (`AppComponent`) se carga el estado almacenado y, si hay red, se refresca contra el backend (`/api/pro/verify`).
- La navegación se protege con el guard `proGuard` (`src/app/core/pro/pro.guard.ts`) y el método reutilizable `requireProFeature()` para botones o acciones puntuales.
- Todas las cadenas nuevas usan i18n (EN/ES) para mantener la localización.

## Frontend
- Servicio: `ProStatusService`
  - `isPro()` / `isPro$()` para comprobar el estado.
  - `refreshProStatus(options?)` consulta el backend con `purchaseToken`, `productId` y `userId` (si están guardados) y persiste la respuesta.
  - `checkPlaySubscription()` encapsula la llamada HTTP al endpoint `/api/pro/verify`.
  - `requireProFeature()` redirige a `/upgrade` y devuelve `false` si el usuario no es PRO.
  - `statusChanged` (`EventEmitter`) dispara eventos para UI.
- UI:
  - Pestaña del agente: botón con overlay de candado si no eres PRO; clic redirige a la página de upgrade.
  - Página de upgrade: `src/app/features/upgrade/` abre la pantalla de suscripciones de Google Play vía `@capacitor/browser`.
  - Ajustes: tarjeta de estado PRO y lista de funciones protegidas (sync nube, historial, recetas avanzadas) protegidas con `requireProFeature()`.
- Integraciones:
  - `AgentService` adjunta `proContext` en el cuerpo y cabeceras `x-pro-token`, `x-pro-product`, `x-pro-user` para que el backend aplique el middleware.
  - `app.component.ts` ejecuta `loadStoredStatus()` y `refreshProStatus()` en el arranque.

## Backend (`backend/`)
- Rutas PRO en `src/pro/`:
  - `subscription.routes.ts` → POST `/api/pro/verify`
  - `subscription.controller.ts` → valida `purchaseToken` y `productId`.
  - `subscription.service.ts` → llama a Google Play Developer API con credenciales de servicio. Evalúa `expiryTimeMillis`, `acknowledgementState` y `cancelReason` para decidir `isPro`.
- Middleware: `src/middleware/pro.middleware.ts`
  - Comprueba `req.user?.isPro` o valida `purchaseToken`/`productId` desde cabeceras (`x-pro-*`), query, body o `proContext`.
  - Responde 403 `PRO_REQUIRED` si no hay PRO activo.
  - Usado en `/agent/process`.
- App: `src/app.ts` monta `/api/pro` y protege `/agent` con el middleware.

## Configuración Google Play (variables entorno)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (contenido JSON, con saltos de línea escapados `\\n`) o `GOOGLE_SERVICE_ACCOUNT_KEYFILE` con ruta a `server/keys/google-service-account.json`.
- `GOOGLE_PACKAGE_NAME` (ej. `com.tuapp`)
- `GOOGLE_SUBSCRIPTION_ID` (ej. `pro_subscription`)

## Uso y extensiones
- Para proteger una ruta: añade `canMatch: [proGuard]` o `canActivate: [proActivateGuard]`.
- Para acciones internas: `if (!proStatus.requireProFeature()) return;`.
- Cuando se añadan nuevas funciones PRO (sync real, historial, etc.), reutiliza `ProStatusService` para comprobar estado y persiste cualquier token de suscripción con `updatePurchaseContext()`.
- Recuerda añadir nuevas cadenas a ambos ficheros i18n (`src/assets/i18n/en.json`, `src/assets/i18n/es.json`).
