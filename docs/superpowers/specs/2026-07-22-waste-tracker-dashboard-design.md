# Waste tracker en Dashboard + unificación visual de "insight pills"

Branch: `feat/waste-tracker-5.1` (desde `release/5.1`)

## Contexto

El roadmap de 5.1 listaba "Desperdicio este mes" como debt-closure: se asumía que el evento
de analytics `WASTE_TRACKER_VIEWED` existía sin feature detrás. Investigación reveló que la
feature está **completa y en producción**, PRO-gated, dentro del tab Insights:

- `core/domain/insights/waste.domain.ts` — `computeWasteSummary()`, ventana rolling 30 días
- `InsightsStateService.wasteSummary` — computed signal, ya cargado
- `WasteTrackerCardComponent` — card de desglose completo (categoría/producto top/trend)
- `insights.component.html` — sección 1, gated por `facade.isPro()`
- `InsightsTrackingStateService.trackWasteCardViewed(surface, ctx)` — **ya acepta
  `surface: 'dashboard' | 'insights'`**, pero nunca se llamó con `'dashboard'`

Único gap real: nunca se surface en Dashboard, pese a que el código ya lo anticipaba
(comentario en `insights-state.service.ts:147`).

Al diseñar el hueco en Dashboard surgió una preocupación de scope: Dashboard ya tiene 4
bloques potenciales (Racha, Hoy, Acciones, Próximas compras) — añadir un 5º sin más lo
sobrecarga. Se decidió ampliar el trabajo para unificar visualmente los "teasers" existentes,
no solo añadir uno más.

## Objetivo

1. Dashboard: nueva fila mostrando el total de desperdicio del mes (dato gratis, real —
   no paywall), tap → tab Insights.
2. Reducir el peso visual del bloque "Próximas compras" cuando es teaser (usuario free) —
   de sección completa con header a fila compacta, igual que Racha.
3. Sin tocar Insights ni Settings — el cambio de densidad es solo para Dashboard.

## Diseño

### 1. `ProPaywallCardComponent` — nuevo input `variant`

`src/app/shared/components/pro-paywall-card/pro-paywall-card.component.ts`

```ts
readonly variant = input<'card' | 'pill'>('card');
```

- `'card'` (default, sin cambios): icono candado + sparkles + título + descripción +
  CTA opcional. Usado hoy en Insights y Settings — comportamiento intacto.
- `'pill'` (nuevo): una fila — candado + título + chevron. Sin descripción, sin CTA
  embebido (el pill nunca lleva `hideCta="false"` en la práctica, pero el input se
  respeta igual). Mismo `onCardClick()` → `/upgrade`, mismo `ANALYTICS_EVENTS.PAYWALL_CARD_CLICKED`,
  mismo `ProCtaUiStateService.isDismissed()`.

Cambios en `.html`: bifurcar el contenido interno de `ion-card-content` con `@if (variant() === 'pill')`.
Cambios en `.scss`: nuevo bloque `&--pill` con padding compacto (mismos tokens que
`streak-card.component.scss`: `--app-theme-spacing-sm/md`), sin min-height del card default.

### 2. `WasteTeaserCardComponent` (nuevo)

`src/app/features/dashboard/components/waste-teaser-card/waste-teaser-card.component.{ts,html,scss}`

Standalone, `OnPush`, sin estado propio — solo input + computed (mismo patrón que
`reposition-card` / `waste-tracker-card`):

```ts
readonly summary = input.required<WasteSummary>();
readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);
```

Template: una fila — icono (`trash-outline` o similar) + texto (reusa
`dashboard.waste.count` / `dashboard.waste.zero`) + chevron. **Sin** candado (no está
bloqueado, dato real y gratis). **Sin** desglose por categoría/producto — eso sigue
exclusivo del `WasteTrackerCardComponent` PRO en Insights. Toda la card es
`routerLink="/insights"`.

Visualmente empareja con el pill de `ProPaywallCardComponent` (mismos tokens de
padding/altura) pero es un componente separado — semántica distinta (real vs locked,
`/insights` vs `/upgrade`, sin dismiss state) no justifica forzarlos al mismo componente.
No se crea un mixin/abstracción compartida para una fila de ~15 líneas de SCSS
duplicadas en 2 sitios.

### 3. `DashboardComponent`

`src/app/features/dashboard/dashboard.component.ts`:
- `readonly wasteSummary = this.insights.wasteSummary;` (ya computado, cero fetch nuevo)
- En `ionViewWillEnter`, tras el track de reposition existente:
  ```ts
  this.insightsTracking.trackWasteCardViewed('dashboard', {
    isPro: this.isInsightsPro(),
    count: this.wasteSummary().totalCount,
  });
  ```
- Import `WasteTeaserCardComponent` en el array `imports`.

`dashboard.component.html`:
- Sección "Próximas compras", rama free: quitar el wrapper `<section class="dashboard-section"><header>...</header>` y el `<app-pro-paywall-card>` pasa a `variant="pill"`, colocado suelto (igual que `<app-streak-card />`).
- Rama PRO (con o sin predicciones): **sin cambios**.
- Nueva fila suelta tras el bloque de reposition: `<app-waste-teaser-card [summary]="wasteSummary()" />`, gated por `facade.totalItems() > 0` (mismo criterio que el resto).

### Sin cambios

- `waste.domain.ts`, `WasteTrackerCardComponent`, gate PRO en Insights — intactos.
- i18n: se reutilizan `dashboard.waste.*` y `dashboard.reposition.*` existentes, sin
  claves nuevas.
- `ANALYTICS_EVENTS.WASTE_TRACKER_VIEWED` — ya definido, solo se empieza a disparar
  también desde `'dashboard'`.
- Insights tab y Settings — `ProPaywallCardComponent` sin `variant` sigue rindiendo
  `'card'` ahí, cero diferencia visual.

## Resultado esperado en Dashboard (usuario free, pantry no vacía)

Racha (pill) → Hoy (sección) → Qué hacer ahora (sección condicional) → Próximas compras
(pill, teaser) → Desperdicio (pill). Antes: 3 secciones completas + 0 pills tras esta
feature habría sido 4. Ahora: máx. 2 secciones completas + 3 pills.

## Testing

- Sin tests nuevos de componente (convención existente: `streak-card`, `reposition-card`
  y `waste-tracker-card` no tienen `.spec.ts`, son presentacionales puros).
- `waste.domain.ts` ya tiene cobertura (`waste.domain.spec.ts`), sin cambios de lógica.
- Verificación manual: `npm run prepare:prod-build` → Android Studio, revisar Dashboard
  free y PRO (toggle `UpgradeRevenuecatService.setDevProState`).
