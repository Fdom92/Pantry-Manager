# Limpieza transversal de la capa `services` (v5.3) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un fallo capturado sea visible en Sentry, que un aviso al usuario se escriba en un solo sitio, que el código de desarrollo no viaje al usuario, y que lo muerto no ocupe.

**Architecture:** Cuatro bloques independientes sobre `src/app/core/services`. Se crean dos servicios nuevos (`ToastService`, `DevNotificationsService`), se reescribe la firma de `LoggerService` para que reporte a Sentry a través de un seam inyectable, y se migran mecánicamente 68 llamadas a `console.*` y 23 creaciones de toast a esos canales. La capa de dominio (`core/domain/`) no se toca en ningún punto: sus 641 tests son la red de regresión.

**Tech Stack:** Angular 20 (standalone, signals), Ionic 8, `@sentry/angular` 10, `@ngx-translate/core`, Karma + Jasmine, PouchDB.

**Spec:** `docs/superpowers/specs/2026-08-21-services-transversal-cleanup-design.md`

**Branch:** `feat/services-cleanup-5.3` (ya creada desde `develop`, contiene el commit del spec)

---

## Comandos de referencia

```bash
ng test --watch=false --browsers=ChromeHeadless                              # suite completa
ng test --watch=false --browsers=ChromeHeadless --include='**/toast.service.spec.ts'   # un fichero
ng lint
ng build --configuration production --stats-json
```

Karma tiene `browsers: ['Chrome']` en `karma.conf.js`; el flag `--browsers=ChromeHeadless` es el modo CI, documentado en `.claude/DEV.md:16`.

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `src/app/core/services/shared/sentry-reporter.ts` | Token de inyección que aísla la API de Sentry para poder falsearla en tests |
| `src/app/core/services/shared/toast.service.ts` | Único punto de presentación de toasts; traduce, elige duración y color |
| `src/app/core/services/shared/toast.service.spec.ts` | Tests de duración, color, traducción e interpolación |
| `src/app/core/services/shared/logger.service.spec.ts` | Tests de reporte a Sentry y de silencio en producción |
| `src/app/core/services/dev/dev-notifications.service.ts` | Los 4 métodos dev del scheduler, cargados perezosamente |
| `src/app/core/services/dev/dev-notifications.service.spec.ts` | Migración del spec existente de `fireDefinitionInFiveSeconds` |

**Se modifican en profundidad:** `shared/logger.service.ts` (firma nueva), `shared/confirm.service.ts` (Ionic en lugar de `window.confirm`), `notifications/notification-scheduler.service.ts` (pierde ~110 líneas dev, gana `evaluateWinnerNow`), `settings/settings-notifications-dev-state.service.ts` y `features/settings/settings.component.ts` (carga dinámica).

**Se borran:** `shared/network.service.ts`.

**Se modifican mecánicamente:** 28 ficheros para `console.*` → `logger`, 15 ficheros para toasts.

---

## Task 1: Seam de Sentry + `LoggerService` que reporta

**Files:**
- Create: `src/app/core/services/shared/sentry-reporter.ts`
- Create: `src/app/core/services/shared/logger.service.spec.ts`
- Modify: `src/app/core/services/shared/logger.service.ts` (reescritura de `warn` y `error`)
- Modify: `src/app/core/services/shared/index.ts`

Contexto: `LoggerService` tiene hoy `error(message, error?, ...args)` cuyas dos ramas `if/else` son idénticas (`logger.service.ts:52-57`). Sentry se inicializa en `main.ts:33` solo con `browserTracingIntegration()`, así que nada de lo que se captura en un `catch` llega al crash reporting. El `beforeSend` de `main.ts:24` ya filtra por consentimiento **todos** los eventos, de modo que no hay que añadir ningún gate nuevo.

El seam existe porque `spyOn` sobre un import de módulo ES no es fiable en Karma; con un `InjectionToken` el spec provee un doble y el test es determinista.

- [ ] **Step 1: Crear el seam de Sentry**

Crear `src/app/core/services/shared/sentry-reporter.ts`:

```ts
import { InjectionToken } from '@angular/core';
import { addBreadcrumb, captureException } from '@sentry/angular';

export interface SentryBreadcrumb {
  level?: 'warning';
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface SentryCaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/**
 * Indirection over the Sentry SDK so LoggerService can be tested with a double.
 * The real implementation is the SDK itself; consent is enforced upstream by the
 * `beforeSend` hook configured in `main.ts`.
 */
export interface SentryReporter {
  captureException(error: unknown, context?: SentryCaptureContext): void;
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void;
}

export const SENTRY_REPORTER = new InjectionToken<SentryReporter>('SENTRY_REPORTER', {
  providedIn: 'root',
  factory: (): SentryReporter => ({
    captureException: (error, context) => captureException(error, context),
    addBreadcrumb: breadcrumb => addBreadcrumb(breadcrumb),
  }),
});
```

- [ ] **Step 2: Escribir el spec que falla**

Crear `src/app/core/services/shared/logger.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';
import { SENTRY_REPORTER, type SentryReporter } from './sentry-reporter';

describe('LoggerService', () => {
  let service: LoggerService;
  let reporter: jasmine.SpyObj<SentryReporter>;

  beforeEach(() => {
    reporter = jasmine.createSpyObj('SentryReporter', ['captureException', 'addBreadcrumb']);
    TestBed.configureTestingModule({
      providers: [LoggerService, { provide: SENTRY_REPORTER, useValue: reporter }],
    });
    service = TestBed.inject(LoggerService);
  });

  describe('error()', () => {
    it('reports the original Error with the scope as a tag', () => {
      const err = new Error('boom');
      service.error('ListStateService', 'markAsBought failed', err);

      expect(reporter.captureException).toHaveBeenCalledTimes(1);
      const [captured, context] = reporter.captureException.calls.mostRecent().args;
      expect(captured).toBe(err);
      expect(context?.tags).toEqual({ scope: 'ListStateService' });
      expect(context?.extra?.['message']).toBe('markAsBought failed');
    });

    it('wraps a non-Error rejection into an Error so Sentry gets a stack', () => {
      service.error('SyncService', 'applyImport failed', 'plain string');

      const [captured] = reporter.captureException.calls.mostRecent().args;
      expect(captured instanceof Error).toBeTrue();
      expect((captured as Error).message).toContain('applyImport failed');
      expect((captured as Error).message).toContain('plain string');
    });

    it('merges extra data into the Sentry context', () => {
      service.error('PantryService', 'save failed', new Error('x'), { itemId: 'item:1' });

      const [, context] = reporter.captureException.calls.mostRecent().args;
      expect(context?.extra?.['itemId']).toBe('item:1');
    });
  });

  describe('warn()', () => {
    it('leaves a breadcrumb and does NOT create a Sentry event', () => {
      service.warn('PantryService', 'Database warmup failed');

      expect(reporter.addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(reporter.captureException).not.toHaveBeenCalled();
      const [breadcrumb] = reporter.addBreadcrumb.calls.mostRecent().args;
      expect(breadcrumb.category).toBe('PantryService');
      expect(breadcrumb.level).toBe('warning');
      expect(breadcrumb.message).toBe('Database warmup failed');
    });
  });
});
```

- [ ] **Step 3: Ejecutar el spec y verificar que falla**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/logger.service.spec.ts'`
Expected: FAIL — el compilador rechaza `service.error('ListStateService', 'markAsBought failed', err)` porque la firma actual es `error(message, error?, ...args)`, y `SENTRY_REPORTER` no se usa en el servicio.

- [ ] **Step 4: Reescribir `warn` y `error`**

En `src/app/core/services/shared/logger.service.ts`, añadir el import y el inject, y sustituir los métodos `warn` y `error` completos (líneas 41-57 del fichero actual):

```ts
import { Injectable, inject, isDevMode } from '@angular/core';
import { SENTRY_REPORTER } from './sentry-reporter';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly isDev = isDevMode();
  private readonly prefix = '[PantryManager]';
  private readonly sentry = inject(SENTRY_REPORTER);

  // log() / debug() / info() se quedan exactamente como están.

  /**
   * Non-fatal condition. Always printed; leaves a Sentry breadcrumb so it gives
   * context to the next captured error, without creating an event of its own.
   */
  warn(scope: string, message: string, extra?: Record<string, unknown>): void {
    console.warn(`${this.prefix} [${scope}] ${message}`, extra ?? '');
    this.sentry.addBreadcrumb({ level: 'warning', category: scope, message, data: extra });
  }

  /**
   * Failure the user suffers. Always printed and always reported to Sentry.
   * Consent is enforced upstream by the `beforeSend` hook in `main.ts`.
   */
  error(scope: string, message: string, err?: unknown, extra?: Record<string, unknown>): void {
    console.error(`${this.prefix} [${scope}] ${message}`, err ?? '');
    const error = err instanceof Error
      ? err
      : new Error(err === undefined ? message : `${message}: ${String(err)}`);
    this.sentry.captureException(error, {
      tags: { scope },
      extra: { message, ...extra },
    });
  }
}
```

- [ ] **Step 5: Ejecutar el spec y verificar que pasa**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/logger.service.spec.ts'`
Expected: PASS, 5 tests.

- [ ] **Step 6: Actualizar los 3 consumidores existentes a la firma nueva**

Son los únicos que ya usaban `LoggerService`, y quedarían rotos por el cambio de firma. Buscarlos:

Run: `grep -rn "logger\.\(warn\|error\)(" src/app --include='*.ts' | grep -v spec`

Ficheros afectados: `shared/storage.service.ts`, `app-update/app-update.service.ts`, `analytics/analytics.service.ts`.

Regla: el primer argumento pasa a ser el nombre de la clase sin corchetes, y el mensaje pierde el prefijo que llevara. Ejemplo:

```ts
// antes
this.logger.error('[StorageService] save failed', err);
// después
this.logger.error('StorageService', 'save failed', err);
```

- [ ] **Step 7: Exportar el seam y compilar**

Añadir a `src/app/core/services/shared/index.ts`:

```ts
export * from './sentry-reporter';
```

Run: `ng build --configuration development`
Expected: build sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/services/shared src/app/core/services/app-update/app-update.service.ts src/app/core/services/analytics/analytics.service.ts
git commit -m "feat(logging): report caught errors to Sentry through LoggerService"
```

---

## Task 2: Migrar `console.*` en `core/services` (excepto pantry)

**Files:**
- Modify: `upgrade/upgrade-revenuecat.service.ts` (15), `settings/settings-state.service.ts` (6), `shared/share.service.ts` (4), `sync/sync.service.ts` (3), `shared/review-prompt.service.ts` (2), `settings/settings-catalogs-state.service.ts` (2), `shared/language.service.ts` (1), `settings/settings-preferences.service.ts` (1), `notifications/notification-scheduler.service.ts` (1), `notifications/notification-registry.service.ts` (1), `history/history-event-log.service.ts` (1), `list/list-state.service.ts` (3), `dashboard/batch-edit-state.service.ts` (1)

Total: 41 llamadas en 13 ficheros.

- [ ] **Step 1: Migrar fichero a fichero**

En cada fichero: inyectar el logger si no está, y convertir cada llamada.

```ts
// añadir al bloque de inyecciones
private readonly logger = inject(LoggerService);
```

```ts
// antes
console.error('[SettingsStateService] toggleAnalytics error', err);
// después
this.logger.error('SettingsStateService', 'toggleAnalytics error', err);

// antes
console.warn('[PantryService] Database warmup failed', err);
// después
this.logger.warn('PantryService', 'Database warmup failed', { err: String(err) });
```

Reglas:
- `console.error` → `logger.error`. `console.warn` → `logger.warn`. `console.log` / `console.debug` → `logger.debug`.
- El ámbito es el nombre de la clase, sin corchetes. Si el mensaje original no llevaba prefijo, usar igualmente el nombre de la clase del fichero.
- `logger.warn` no acepta un `unknown` suelto: lo que fuera el segundo argumento va dentro de `extra`.
- **No se toca ninguna otra línea.** Ni el `catch`, ni el `return`, ni el flujo de recuperación. El riesgo real de esta tarea es alterar por accidente el manejo del error, no el log.

- [ ] **Step 2: Verificar que no queda ninguno**

Run:
```bash
grep -rn 'console\.' src/app/core/services --include='*.ts' | grep -v spec | grep -v logger.service.ts | grep -v /pantry/
```
Expected: sin resultados.

- [ ] **Step 3: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio; suite verde (los 641 tests de dominio incluidos).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services
git commit -m "refactor(logging): route core service errors through LoggerService"
```

---

## Task 3: Migrar `console.*` en `core/services/pantry` y en features

**Files:**
- Modify: `pantry/pantry-store.service.ts` (5), `pantry/modals/pantry-fresh-edit-modal-state.service.ts` (4), `pantry/modals/pantry-receipt-scan-modal-state.service.ts` (3), `pantry/pantry.service.ts` (2), `pantry/pantry-query.service.ts` (2), `pantry/modals/pantry-edit-item-modal-state.service.ts` (2), `pantry/pantry-list-ui-state.service.ts` (1), `pantry/pantry-batch-operations.service.ts` (1), `pantry/modals/pantry-pendientes-sheet-state.service.ts` (1), `pantry/modals/pantry-fresh-add-modal-state.service.ts` (1), `pantry/modals/pantry-consume-modal-state.service.ts` (1), `pantry/modals/pantry-batches-modal-state.service.ts` (1), `pantry/modals/pantry-add-modal-state.service.ts` (1)
- Modify: `src/app/features/settings/settings.component.ts` (1), `src/app/app.component.ts` (1)

Total: 27 llamadas en 15 ficheros. Se separa de la Task 2 porque pantry es la pantalla más usada de la app y conviene poder revertir este commit solo.

- [ ] **Step 1: Migrar aplicando exactamente las mismas reglas de la Task 2**

Mismo patrón, mismo ámbito = nombre de clase, misma prohibición de tocar el flujo.

- [ ] **Step 2: Verificar que no queda ninguno en todo `src/app`**

Run:
```bash
grep -rn 'console\.' src/app --include='*.ts' | grep -v spec | grep -v logger.service.ts
```
Expected: sin resultados. (`src/main.ts` queda fuera a propósito: corre antes del bootstrap de Angular y ahí no hay inyector.)

- [ ] **Step 3: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio, suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "refactor(logging): route pantry and feature errors through LoggerService"
```

---

## Task 4: `ToastService`

**Files:**
- Create: `src/app/core/services/shared/toast.service.ts`
- Create: `src/app/core/services/shared/toast.service.spec.ts`
- Modify: `src/app/core/services/shared/index.ts`

Contexto: 23 creaciones de toast en 15 ficheros, con seis duraciones distintas sin criterio (1200, 1500, 1800, 2000, 2500, 3000 ms) y un `translate.instant` repetido delante de casi todas.

- [ ] **Step 1: Escribir el spec que falla**

Crear `src/app/core/services/shared/toast.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let translate: jasmine.SpyObj<TranslateService>;
  let present: jasmine.Spy;

  beforeEach(() => {
    present = jasmine.createSpy('present').and.returnValue(Promise.resolve());
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.returnValue(Promise.resolve({ present } as any));
    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => `t:${key}`);

    TestBed.configureTestingModule({
      providers: [
        ToastService,
        { provide: ToastController, useValue: toastCtrl },
        { provide: TranslateService, useValue: translate },
      ],
    });
    service = TestBed.inject(ToastService);
  });

  it('presents a success toast for 1500 ms at the bottom', async () => {
    service.success('pantry.toasts.saved');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 't:pantry.toasts.saved', duration: 1500, position: 'bottom' })
    );
    expect(present).toHaveBeenCalled();
  });

  it('presents an error toast for 3000 ms with the danger colour', async () => {
    service.error('shopping.share.error');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ duration: 3000, color: 'danger' })
    );
  });

  it('presents an info toast for 2000 ms', async () => {
    service.info('settings.privacy.toastEnabled');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ duration: 2000 }));
  });

  it('passes interpolation params to the translator', () => {
    service.success('shopping.toasts.bought', { name: 'Leche' });

    expect(translate.instant).toHaveBeenCalledWith('shopping.toasts.bought', { name: 'Leche' });
  });

  it('raw() does not translate and honours explicit options', async () => {
    service.raw('Marked as internal. ID: 42', { duration: 3000, position: 'top' });
    await Promise.resolve();

    expect(translate.instant).not.toHaveBeenCalled();
    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'Marked as internal. ID: 42', duration: 3000, position: 'top' })
    );
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verificar que falla**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/toast.service.spec.ts'`
Expected: FAIL — `Cannot find module './toast.service'`.

- [ ] **Step 3: Implementar el servicio**

Crear `src/app/core/services/shared/toast.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

export interface ToastOptions {
  duration?: number;
  position?: 'top' | 'bottom';
  color?: string;
}

const DURATION = {
  success: 1500,
  info: 2000,
  error: 3000,
} as const;

/**
 * Single presentation point for toasts. Takes an i18n key, not a string:
 * every call site used to repeat `translate.instant` right before creating
 * the toast. Durations are fixed per intent — six different values had crept
 * in across 23 hand-rolled call sites.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  success(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), { duration: DURATION.success });
  }

  info(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), { duration: DURATION.info });
  }

  error(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), {
      duration: DURATION.error,
      color: 'danger',
    });
  }

  /** For messages already built by the caller (concatenations, dev panels). */
  raw(message: string, opts?: ToastOptions): void {
    void this.present(message, opts);
  }

  private async present(message: string, opts?: ToastOptions): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: opts?.duration ?? DURATION.info,
      position: opts?.position ?? 'bottom',
      ...(opts?.color ? { color: opts.color } : {}),
    });
    await toast.present();
  }
}
```

- [ ] **Step 4: Ejecutar el spec y verificar que pasa**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/toast.service.spec.ts'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Exportarlo**

Añadir a `src/app/core/services/shared/index.ts`:

```ts
export * from './toast.service';
```

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/shared/toast.service.ts src/app/core/services/shared/toast.service.spec.ts src/app/core/services/shared/index.ts
git commit -m "feat(ui): add ToastService as the single toast presentation point"
```

---

## Task 5: Migrar los toasts de `core/services/pantry`

**Files:**
- Modify: `pantry/pantry-state.service.ts:486,512`, `pantry/pantry-list-ui-state.service.ts:109`, `pantry/modals/pantry-add-modal-state.service.ts:161`, `pantry/modals/pantry-edit-item-modal-state.service.ts:247,312`, `pantry/modals/pantry-fresh-edit-modal-state.service.ts:137,162,195`, `pantry/modals/pantry-fresh-add-modal-state.service.ts:252`, `pantry/modals/pantry-pendientes-sheet-state.service.ts:167`, `pantry/modals/pantry-quantity-sheet-state.service.ts:78,85`, `pantry/modals/pantry-batches-modal-state.service.ts:305`, `pantry/modals/pantry-receipt-scan-modal-state.service.ts:153,321`

16 sitios en 10 ficheros.

- [ ] **Step 1: Sustituir cada sitio**

Patrón, con el ejemplo real de `pantry-pendientes-sheet-state.service.ts:167`:

```ts
// antes
const toast = await this.toastCtrl.create({
  message: this.translate.instant('pantry.pendientesSheet.savedToast', { count: savedCount }),
  duration: 1500,
  position: 'bottom',
});
void toast.present();

// después
this.toast.success('pantry.pendientesSheet.savedToast', { count: savedCount });
```

Criterio para elegir el método:
- Confirmación de una acción que salió bien → `success`.
- Aviso neutro o informativo → `info`.
- Fallo que el usuario debe notar → `error`.

- [ ] **Step 2: Retirar las dependencias muertas**

En cada fichero migrado, borrar `private readonly toastCtrl = inject(ToastController);` y su import **si ya no queda ningún uso**, y lo mismo con `TranslateService` si el toast era su único consumidor. Añadir `private readonly toast = inject(ToastService);`.

Run: `grep -rn "ToastController" src/app/core/services/pantry --include='*.ts'`
Expected: sin resultados.

- [ ] **Step 3: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio, suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/pantry
git commit -m "refactor(ui): present pantry toasts through ToastService"
```

---

## Task 6: Migrar los toasts restantes

**Files:**
- Modify: `list/list-state.service.ts:234` (y su método privado `showToast`), `dashboard/batch-edit-state.service.ts:167`, `settings/settings-notifications-dev-state.service.ts:93`, `retention/streak-milestone.service.ts:35`, `src/app/features/settings/settings.component.ts:110,167`, `src/app/features/dashboard/dashboard.component.ts:142`

7 sitios en 6 ficheros (uno de ellos, `list-state.service.ts`, con un helper privado `showToast(message, duration = 2500)` usado desde varios puntos: se borra el helper y sus llamantes pasan a `this.toast.*`).

- [ ] **Step 1: Migrar aplicando el mismo criterio de la Task 5**

Dos casos que **no** siguen el patrón por defecto y se resuelven con `raw`:

```ts
// retention/streak-milestone.service.ts:35 — celebración, arriba y más larga a propósito
const toastEl = await this.toast.create({ message, duration: 4000, position: 'top' });
// pasa a
this.toast.raw(message, { duration: 4000, position: 'top' });

// features/settings/settings.component.ts:167 — mensaje de dev construido por concatenación
this.toast.raw(`Marked as internal. ID: ${id}`, { duration: 3000 });
```

- [ ] **Step 2: Verificar que no queda ningún `ToastController` en la app**

Run: `grep -rn "ToastController" src/app --include='*.ts' | grep -v toast.service`
Expected: sin resultados.

- [ ] **Step 3: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio, suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "refactor(ui): present remaining toasts through ToastService"
```

---

## Task 7: Sacar los métodos dev del scheduler

**Files:**
- Create: `src/app/core/services/dev/dev-notifications.service.ts`
- Create: `src/app/core/services/dev/dev-notifications.service.spec.ts`
- Modify: `notifications/notification-scheduler.service.ts` (borrar 4 métodos, añadir `evaluateWinnerNow`)
- Modify: `notifications/notification-scheduler.service.spec.ts` (mover el bloque de `fireDefinitionInFiveSeconds`)
- Modify: `settings/settings-notifications-dev-state.service.ts` (carga dinámica)
- Modify: `src/app/features/settings/settings.component.ts:266,295,305` (carga dinámica)

Contexto: `NotificationSchedulerService` (361 loc) lleva ~110 líneas en 4 métodos marcados "Dev-only". `scheduleTestNotification` y `scheduleNotificationAtTime` son idénticos salvo la hora de disparo, así que al mover se funden en `fireWinning(at: Date)`.

- [ ] **Step 1: Exponer la evaluación en el scheduler**

En `notification-scheduler.service.ts`, añadir junto al `evaluateWinningNotification` privado (que se mantiene):

```ts
/**
 * Evaluate every registered definition against the current pantry and return
 * the winning payload for `now`. Public because the dev panel needs the real
 * evaluation logic without duplicating the context assembly.
 */
evaluateWinnerNow(now: Date): ScheduledNotification | null {
  const preferences = this.preferencesService.preferences();
  const items = this.pantryStore.loadedProducts();
  const t = (key: string, params?: Record<string, unknown>): string =>
    this.translate.instant(key, params);
  return this.evaluateWinningNotification(preferences, items, now, t);
}
```

- [ ] **Step 2: Borrar del scheduler los 4 métodos dev**

Borrar completos: `scheduleNotificationAtTime`, `previewNextNotification`, `scheduleTestNotification` y `fireDefinitionInFiveSeconds`. El fichero baja de 361 a ~250 líneas y se queda solo con producción (`scheduleAll`, `cancelAll`, `scheduleProjectedNotifications`, `scheduleStreakMilestone`, `handleNotificationTap`, `evaluateWinnerNow`, `evaluateWinningNotification`).

- [ ] **Step 3: Crear el servicio dev**

Crear `src/app/core/services/dev/dev-notifications.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationRegistryService } from '@core/services/notifications/notification-registry.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Dev-panel only. Loaded with a dynamic import so it never reaches the initial
 * production bundle. Holds what used to be four "Dev-only" methods inside
 * NotificationSchedulerService.
 */
@Injectable({ providedIn: 'root' })
export class DevNotificationsService {
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);

  /** Evaluate without scheduling. Returns null when nothing would be sent. */
  previewNext(): { title: string; body: string } | null {
    const winner = this.scheduler.evaluateWinnerNow(new Date());
    return winner ? { title: winner.title, body: winner.body } : null;
  }

  /**
   * Fire the winning notification at `at`. Replaces the old pair
   * scheduleTestNotification (now + 5s) / scheduleNotificationAtTime (hh:mm),
   * which differed only in that date.
   */
  async fireWinning(at: Date): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (!(await this.ensurePermission())) return false;

    const winner = this.scheduler.evaluateWinnerNow(new Date());
    if (!winner) return false;

    await this.plugin.schedule([{
      id: winner.id,
      title: winner.title,
      body: winner.body,
      scheduleAt: at,
      extra: winner.extra,
    }]);
    return true;
  }

  /** Fire one specific definition regardless of priority, in ~5 seconds. */
  async fireDefinition(definitionId: number): Promise<boolean> {
    const def = this.registry.getById(definitionId);
    if (!def) return false;
    if (!(await this.ensurePermission())) return false;

    const t = (key: string, params?: Record<string, unknown>): string =>
      this.translate.instant(key, params);
    const payload = def.build({
      items: this.pantryStore.loadedProducts(),
      preferences: this.preferencesService.preferences(),
      t,
      now: new Date(),
    });
    if (!payload) return false;

    await this.plugin.schedule([{
      id: payload.id,
      title: payload.title,
      body: payload.body,
      scheduleAt: new Date(Date.now() + 5_000),
      extra: payload.extra,
    }]);
    return true;
  }

  private async ensurePermission(): Promise<boolean> {
    await this.permission.init();
    if (this.permission.isGranted()) return true;
    return await this.permission.request();
  }
}
```

- [ ] **Step 4: Mover el spec existente**

`notification-scheduler.service.spec.ts:58-116` contiene `describe('NotificationSchedulerService — fireDefinitionInFiveSeconds')` con tres tests: dispara la definición registrada, devuelve `false` con un id desconocido, y devuelve `false` cuando `build()` no produce payload.

Mover ese bloque a `src/app/core/services/dev/dev-notifications.service.spec.ts`, renombrando el `describe` a `DevNotificationsService — fireDefinition`, el servicio bajo prueba a `DevNotificationsService` y las llamadas a `svc.fireDefinition(...)`. Los dobles de `CapacitorNotificationPlugin`, `NotificationPermissionService` y `NotificationRegistryService` se conservan tal cual; añadir dobles para `NotificationSchedulerService`, `SettingsPreferencesService`, `PantryStoreService` y `TranslateService` según lo que inyecta el servicio nuevo.

- [ ] **Step 5: Ejecutar ambos specs**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/dev-notifications.service.spec.ts'`
Expected: PASS, 3 tests.

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/notification-scheduler.service.spec.ts'`
Expected: PASS, sin el bloque movido.

- [ ] **Step 6: Actualizar `SettingsNotificationsDevStateService` con carga dinámica**

En `settings/settings-notifications-dev-state.service.ts`: borrar `private readonly scheduler = inject(NotificationSchedulerService);` y su import, añadir `private readonly injector = inject(Injector);` y un accesor perezoso:

```ts
private async dev(): Promise<DevNotificationsService> {
  const { DevNotificationsService } = await import('@core/services/dev/dev-notifications.service');
  return this.injector.get(DevNotificationsService);
}
```

Los métodos pasan a:

```ts
async previewNext(): Promise<{ title: string; body: string } | null> {
  return (await this.dev()).previewNext();
}

async fireWinning(): Promise<void> {
  const ok = await (await this.dev()).fireWinning(new Date(Date.now() + 5_000));
  await this.notifyOutcome(ok);
  await this.refreshPending();
}

async fireDefinition(definitionId: number): Promise<void> {
  const ok = await (await this.dev()).fireDefinition(definitionId);
  await this.notifyOutcome(ok);
  await this.refreshPending();
}

async fireProjected(): Promise<void> {
  const dev = await this.dev();
  const ok = await dev.fireDefinition(NOTIFICATION_IDS.EXPIRED_ITEMS)
    || await dev.fireDefinition(NOTIFICATION_IDS.NEAR_EXPIRY)
    || await dev.fireDefinition(NOTIFICATION_IDS.LOW_STOCK);
  await this.notifyOutcome(ok);
  await this.refreshPending();
}
```

`import type { DevNotificationsService }` — solo tipo, para que el import estático no arrastre el módulo.

- [ ] **Step 7: Actualizar el panel dev de `SettingsComponent`**

En `features/settings/settings.component.ts`, las tres llamadas (líneas 266, 295, 305) pasan por el mismo accesor perezoso:

```ts
private async devNotifications(): Promise<DevNotificationsService> {
  const { DevNotificationsService } = await import('@core/services/dev/dev-notifications.service');
  return this.injector.get(DevNotificationsService);
}
```

- línea 266: `await this.scheduler.scheduleTestNotification();` → `await (await this.devNotifications()).fireWinning(new Date(Date.now() + 5_000));`
- línea 295: `await this.scheduler.scheduleNotificationAtTime(hour, minute);` → construir la fecha y llamar a `fireWinning`:

```ts
const at = new Date();
at.setHours(hour, minute, 0, 0);
await (await this.devNotifications()).fireWinning(at);
```

- línea 305: `const result = await this.scheduler.previewNextNotification();` → `const result = (await this.devNotifications()).previewNext();`

Si tras esto `NotificationSchedulerService` ya no se usa en el componente, borrar su `inject` y su import.

- [ ] **Step 8: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio, suite verde.

- [ ] **Step 9: Commit**

```bash
git add src/app/core/services/dev src/app/core/services/notifications src/app/core/services/settings/settings-notifications-dev-state.service.ts src/app/features/settings/settings.component.ts
git commit -m "refactor(notifications): move dev-only scheduling out of the production scheduler"
```

---

## Task 8: Cargar el seeder de marketing bajo demanda

**Files:**
- Modify: `src/app/features/settings/settings.component.ts:89` (el `inject`) y el método `seedMarketingDatabase`

Contexto: `DevMarketingSeederService` son 712 líneas con nombres de producto en 6 idiomas. Se inyecta incondicionalmente en la línea 89; el flag `isDev` (línea 97) solo esconde el botón en la plantilla, así que el árbol de dependencias ya lo arrastró al bundle.

- [ ] **Step 1: Sustituir la inyección por una carga dinámica**

Borrar `private readonly marketingSeeder = inject(DevMarketingSeederService);` y su import estático (dejar `import type` si hace falta el tipo). El método pasa a:

```ts
async seedMarketingDatabase(): Promise<void> {
  if (this.isSeedingMarketing()) return;
  const confirmed = window.confirm(this.translate.instant('settings.dev.seedMarketingConfirm'));
  if (!confirmed) return;
  this.isSeedingMarketing.set(true);
  try {
    const { DevMarketingSeederService } = await import('@core/services/dev/dev-marketing-seeder.service');
    const seeder = this.injector.get(DevMarketingSeederService);
    await seeder.seedMarketingDatabase(this.translate.currentLang);
  } finally {
    this.isSeedingMarketing.set(false);
  }
}
```

`private readonly injector = inject(Injector);` si no está ya (la Task 7 lo añade).

Nota: el `window.confirm` de esta línea es de un flujo exclusivamente dev y **queda fuera del alcance de la Task 10**, que solo sustituye los tres usos de `ConfirmService`.

- [ ] **Step 2: Verificar que no queda ninguna referencia estática**

Run: `grep -rn "DevMarketingSeederService" src/app --include='*.ts'`
Expected: solo el propio fichero del servicio y el `import type` / import dinámico del componente.

- [ ] **Step 3: Comprobar el chunk perezoso**

Run: `ng build --configuration production`
Expected: la salida lista un lazy chunk nuevo; el bundle inicial baja. Anotar la cifra para el resumen de la Task 11.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/settings/settings.component.ts
git commit -m "perf(dev): load the marketing seeder on demand instead of bundling it"
```

---

## Task 9: Borrados

**Files:**
- Delete: `src/app/core/services/shared/network.service.ts` (no está exportado en `shared/index.ts`, así que el barrel no se toca)
- Modify: `src/app/core/services/upgrade/upgrade-revenuecat.service.ts:17,29`
- Modify: `src/app/core/services/tabs/tabs-state.service.ts:17`
- Modify: `src/app/core/services/settings/catalog-options.service.ts:22,43,64`

- [ ] **Step 1: Verificar que `NetworkService` sigue sin consumidores y borrarlo**

Run: `grep -rn "NetworkService" src --include='*.ts' --include='*.html' | grep -v 'shared/network.service.ts'`
Expected: sin resultados.

```bash
git rm src/app/core/services/shared/network.service.ts
```

- [ ] **Step 2: Verificar que `canUseAgent` no se usa en ninguna plantilla y borrarlo**

Run: `grep -rn "canUseAgent" src --include='*.ts' --include='*.html'`
Expected: exactamente tres sitios, los tres en TypeScript — `upgrade-revenuecat.service.ts:17` (`canUseAgent$`), `upgrade-revenuecat.service.ts:29` (`canUseAgent()`) y `tabs-state.service.ts:17`. **Si aparece cualquier `.html`, parar y reportar**: la feature seguiría viva y este borrado no procede.

Borrar los tres. Es un fósil de la feature agent, eliminada en la 4.4. Si al quitar `canUseAgent$` el import de `map` de RxJS queda sin uso en `upgrade-revenuecat.service.ts`, quitarlo también.

- [ ] **Step 3: Borrar las tres variables muertas**

En `catalog-options.service.ts`, borrar estas tres líneas — el valor se calcula y no se usa nunca (la función auxiliar recibe la función normalizadora, no su resultado):

```ts
const normalized = normalizeCategoryId(formatted);      // línea 22
const normalized = normalizeLocationId(formatted);      // línea 43
const normalized = normalizeSupermarketValue(formatted); // línea 64
```

Comprobar después si algún import de normalización queda huérfano y quitarlo.

- [ ] **Step 4: Compilar, lint y suite**

Run: `ng build --configuration development && ng lint && ng test --watch=false --browsers=ChromeHeadless`
Expected: los tres limpios.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/core/services
git commit -m "chore(cleanup): delete NetworkService, the canUseAgent fossil and dead locals"
```

---

## Task 10: `ConfirmService` sobre Ionic

**Files:**
- Modify: `src/app/core/services/shared/confirm.service.ts` (reescritura completa)
- Modify: `src/app/core/services/pantry/pantry-list-ui-state.service.ts:93`
- Modify: `src/app/core/services/settings/settings-state.service.ts:59,127`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

Contexto: `ConfirmService` envuelve `window.confirm`, un diálogo de navegador dentro de una app Ionic que además bloquea el hilo del WebView. Tres llamantes, los tres en flujos destructivos y los tres ya dentro de métodos `async`.

- [ ] **Step 1: Añadir la clave de botón que falta en los 6 idiomas**

`common.actions.cancel` y `common.actions.delete` ya existen en los seis ficheros. Falta `common.actions.confirm`, para los dos diálogos de ajustes donde "Eliminar" no es la palabra correcta. Añadir dentro de `common.actions` en cada fichero:

| Fichero | Valor |
|---|---|
| `src/assets/i18n/es.json` | `"confirm": "Confirmar"` |
| `src/assets/i18n/en.json` | `"confirm": "Confirm"` |
| `src/assets/i18n/de.json` | `"confirm": "Bestätigen"` |
| `src/assets/i18n/fr.json` | `"confirm": "Confirmer"` |
| `src/assets/i18n/it.json` | `"confirm": "Conferma"` |
| `src/assets/i18n/pt.json` | `"confirm": "Confirmar"` |

- [ ] **Step 2: Reescribir el servicio**

`src/app/core/services/shared/confirm.service.ts` completo:

```ts
import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

export interface ConfirmOptions {
  /** i18n key for the confirming button. Defaults to `common.actions.confirm`. */
  confirmKey?: string;
  header?: string;
}

/**
 * Confirmation dialog for destructive flows. Uses Ionic's AlertController —
 * `window.confirm` renders a browser dialog inside the app and blocks the
 * WebView thread while it is open.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  async confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header: opts?.header,
      message,
      buttons: [
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
        { text: this.translate.instant(opts?.confirmKey ?? 'common.actions.confirm'), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
```

- [ ] **Step 3: Actualizar los tres llamantes**

`pantry-list-ui-state.service.ts:93` — dentro de `async deleteItem(...)`, añadir el `await` y pedir el botón "Eliminar":

```ts
const confirmed = await this.confirm.confirm(msg, { confirmKey: 'common.actions.delete' });
```

`settings-state.service.ts:59` — dentro de `async resetApplicationData()`, añadir el `await`:

```ts
const confirmed = await this.confirm.confirm(this.translate.instant('settings.reset.confirm'));
```

`settings-state.service.ts:127` — ya hacía `await` sobre el booleano síncrono; ahora el `await` es real y no hay nada que cambiar.

- [ ] **Step 4: Compilar y pasar la suite**

Run: `ng build --configuration development && ng test --watch=false --browsers=ChromeHeadless`
Expected: build limpio, suite verde.

- [ ] **Step 5: Verificación manual en el navegador**

Run: `ng serve`

Comprobar los tres flujos, **confirmando y cancelando en cada uno**:
1. Despensa → borrar un producto: aparece alerta Ionic con "Cancelar" / "Eliminar". Cancelar no borra; confirmar sí.
2. Ajustes → resetear datos: alerta con "Cancelar" / "Confirmar".
3. Ajustes → importar backup: alerta con "Cancelar" / "Confirmar"; al confirmar, los datos se restauran.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/shared/confirm.service.ts src/app/core/services/pantry/pantry-list-ui-state.service.ts src/app/core/services/settings/settings-state.service.ts src/assets/i18n
git commit -m "feat(ui): replace window.confirm with an Ionic alert in destructive flows"
```

---

## Task 11: Verificación final

**Files:** ninguno (solo comprobación y medición)

- [ ] **Step 1: Suite completa y lint**

Run: `ng test --watch=false --browsers=ChromeHeadless && ng lint`
Expected: verde. Los 641 tests de dominio deben pasar **sin haber sido modificados** — si alguno cambió, este plan se salió de su alcance.

- [ ] **Step 2: Comprobar que los canales viejos están muertos**

Run:
```bash
grep -rn 'console\.' src/app --include='*.ts' | grep -v spec | grep -v logger.service.ts
grep -rn 'ToastController' src/app --include='*.ts' | grep -v toast.service
grep -rn 'window.confirm' src/app --include='*.ts' | grep -v settings.component.ts
grep -rn 'canUseAgent\|NetworkService' src --include='*.ts' --include='*.html'
```
Expected: los cuatro sin resultados.

- [ ] **Step 3: Medir el bundle**

Run: `ng build --configuration production`
Expected: anotar el tamaño del bundle inicial y compararlo con el de `develop` (`git stash` no hace falta: basta con construir `develop` en otra carpeta o anotar la cifra previa antes de empezar). Reportar la diferencia.

- [ ] **Step 4: QA manual en dispositivo**

Run: `npm run prepare:build` y desplegar en el dispositivo.

Checklist — la lección de la 5.2 es que estos fallos salen ejecutando la app, no en los tests:

1. Borrar un producto → nuevo diálogo, confirmar y cancelar.
2. Resetear datos → nuevo diálogo, confirmar y cancelar.
3. Importar un backup → nuevo diálogo, confirmar y cancelar; verificar que los datos se restauran.
4. Un toast de cada tipo: guardar un producto (success), fallo al compartir la lista (error), alta múltiple desde la sheet de pendientes (success con contador).
5. Panel dev de notificaciones: disparar la ganadora, una definición concreta, la de bienvenida, "programar a las hh:mm", y cancelar todas.
6. Seeder de marketing en build de desarrollo.
7. Comprobar en el proyecto Sentry de **dev** que llega un evento real desde un `catch` (por ejemplo, forzar un fallo de compartir con el modo avión activado) y que trae el tag `scope`.

- [ ] **Step 5: Vigilancia de volumen en Sentry**

Anotar como seguimiento: revisar el proyecto de producción **48 h después de publicar**. Van a empezar a llegar fallos hoy invisibles — es el objetivo, pero puede comerse la cuota gratuita. Silenciar lo ruidoso antes de que descarte eventos útiles.

- [ ] **Step 6: Actualizar la documentación del repo**

En `.claude/PATTERNS.md`, añadir las dos recetas nuevas: presentar un toast (`this.toast.success('clave.i18n', { params })`) y registrar un fallo (`this.logger.error('NombreDeClase', 'qué falló', err)`), señalando que `console.*` ya no se usa en `src/app`.

- [ ] **Step 7: Commit**

```bash
git add .claude/PATTERNS.md
git commit -m "docs(patterns): document the toast and logging recipes"
```

---

## Deuda de test conocida (anotada durante la ejecución)

`NotificationSchedulerService` se queda **sin cobertura unitaria** tras la Task 7.
Su único spec cubría `fireDefinitionInFiveSeconds`, que se movió con su servicio a
`dev-notifications.service.spec.ts`; el fichero que quedaba solo declaraba que no
tenía tests, y se borró. Sin cubrir: `scheduleAll`, `cancelAll`,
`scheduleProjectedNotifications`, `scheduleStreakMilestone`, `handleNotificationTap`
y `evaluateWinnerNow`. No entra en esta rama —, es trabajo de test nuevo sobre código
que este plan no modifica— pero queda escrito para que no se descubra por sorpresa.

## Fuera de alcance

Este plan no toca `core/domain/` en ningún punto, ni la deuda estructural medida en la misma auditoría (pila de cuatro capas de pantry, fachada de 65 señales, `ListStateService` con 250 líneas de PDF, catálogos triplicados, 9 servicios de modal sin base común). Está toda documentada con cifras en la sección "Fuera de alcance" del spec.

`SettingsNotificationsDevStateService` (100 loc) sigue en el bundle de producción tras la Task 7: su plantilla se enlaza a `dev.*` en el componente de ajustes y sacarlo exigiría tocar la plantilla. Queda anotado, no se hace aquí.
