# Rediseño de Insights — 4 tarjetas con interpretación

**Fecha:** 2026-09-29. **Rama destino:** `release/5.6`. Origen: puntos #6, #7, #12 de la
segunda tanda de QA de Fernando (2026-09-25/28), aplazados a esta sesión de diseño.

## Por qué

Tres quejas relacionadas sobre la pantalla de Análisis:
- **#6** — "Tu despensa ahora" (activos/caducados/revisar/sin fecha) no da ningún análisis,
  solo cuenta lo que ya se ve en Despensa.
- **#7** — las tarjetas no tienen nombres claros ni un criterio de qué se queda.
- **#12** — ninguna tarjeta dice si el número está en buen rango o no. Se muestra el dato
  crudo y el usuario tiene que interpretarlo solo.

## Qué se queda, qué se va

**Se van, sin pérdida funcional:**
- **"Tu despensa ahora"** (`insights.component.html` SECTION 2, `computeInventorySnapshot`) —
  resumen sin interpretar; sus números ya están cubiertos por los filtros de Despensa.
- **"Calidad del inventario"** (SECTION 5, `computePantryScore`) — mide si el usuario ha
  rellenado bien los datos, no algo sobre la comida. Su único uso real (el enlace a
  "Completar pendientes") ya vive en la tarjeta "Faltan datos" del Dashboard
  (`dashboard-state.service.ts`) — no se pierde la función, solo la duplicación.

**Se quedan, en este orden, cada una con nombre + pastilla de estado + frase:**

1. **Desperdicio** (ya existente, `waste-tracker-card`)
2. **Cobertura** (`computeFoodCoverage`, SECTION 3 — sube de la 3ª posición actual)
3. **Rotación** (`computeActivityMetrics`, SECTION 4 — la etiqueta "Últimos 30 días" pasa a subtítulo)
4. **Clasificación** (`computeDistribution`, SECTION 6 — nombre nuevo, antes sin título propio claro)

El reparto PRO no cambia: solo Desperdicio tiene parte de pago (desglose por categoría +
tendencia); Cobertura, Rotación y Clasificación siguen siendo gratis del todo. Añadir
profundidad PRO a otra tarjeta (p. ej. tendencia histórica en Cobertura) queda fuera de
este diseño — pediría guardar histórico que hoy no existe.

## El patrón de interpretación

Elegido tras comparar 3 tratamientos en el compañero visual (pastilla+frase / barra de
rango / solo texto): **pastilla de color (verde/ámbar/rojo) junto al número, más una
frase corta debajo que traduce el número a algo cotidiano.**

Nuevo componente compartido `app-insight-status-pill` (`src/app/shared/components/`),
usado por Desperdicio, Cobertura y Rotación — las 3 tarjetas con un número que admite
un juicio bueno/normal/malo:

```html
<app-insight-status-pill [level]="level" [labelKey]="labelKey" />
```

`level: 'good' | 'normal' | 'bad'` decide el color; `labelKey` es la clave i18n del
texto de la pastilla (p. ej. `insights.waste.level.none`). El componente no calcula
nada — cada tarjeta le pasa el nivel ya resuelto por su propia función de dominio.

**Clasificación no lleva pastilla.** No es un número con rango bueno/malo, es un reparto
por categoría — forzar un color ahí inventaría un juicio que el dato no sostiene. Ya
calcula `mostWastedFoodType` / `leastRotatingFoodType` (`computeDistribution`,
`insights-free.domain.ts:132-191`) y el template YA los muestra
(`insights.component.html:154-165`, claves `insights.distribution.mostWasted` /
`leastRotating`) — este rediseño no añade cálculo aquí, solo les da el mismo peso
visual que a las otras 3 tarjetas en vez de dejarlos como nota al pie.

## Umbrales nuevos (funciones de dominio puras, con test)

**Rotación** — reutiliza `ActivityMetrics.rotationRatio` (`insights-free.domain.ts:118-124`),
ya existente: `high` (≥60% consumido/añadido) → verde, `medium` (≥25%) → ámbar, `low` → rojo.
Sin cambio de cálculo, solo se pinta con el componente nuevo en vez del `rotation-badge` actual.

**Cobertura** — nueva función pura `classifyCoverageLevel(days: number): 'good' | 'normal' | 'bad'`
en `insights-free.domain.ts`, junto a `computeFoodCoverage`:
- `< 3` días → `bad` (rojo, "Bajo")
- `3–7` días → `normal` (ámbar, "Ajustado")
- `> 7` días → `good` (verde, "Buena")

**Desperdicio** — nueva función pura `classifyWasteLevel(totalCount: number): 'good' | 'normal' | 'bad'`
en `waste.domain.ts`, junto a `computeWasteSummary`:
- `0` → `good` (verde, "Sin desperdicio")
- `1–2` → `normal` (ámbar, "Normal")
- `≥ 3` → `bad` (rojo, "Alto")

Los umbrales son estimaciones razonables sin datos reales de referencia — ajustables más
adelante con los export de PostHog si hace falta. No los convierto en constantes
configurables; son literales en el propio clasificador, como el resto de umbrales del
dominio (p. ej. `URGENCY_WEIGHT`, `NEAR_EXPIRY_WINDOW_DAYS`).

## Cobertura: selector de personas

El `ion-segment` 1/2/3/4+ ya existente (`insights.component.html:91-102`,
`facade.householdSize()`, persistido en `LocalStorageService`) **no cambia** — se queda
tal cual, debajo de la pastilla y la frase nuevas.

## Frases (i18n, 6 bundles, es como fuente)

Claves nuevas bajo `insights.*`, siguiendo la convención existente (nunca texto suelto
en la plantilla, nunca renombrar claves ya usadas por analítica):
- `insights.waste.level.none/normal/high` (pastilla) — el conteo (`dashboard.waste.count*`)
  ya existe, se reutiliza como frase.
- `insights.coverage.level.low/tight/good` (pastilla) — clave nueva
  `insights.coverage.sentence` para la frase ("Con lo que tienes, aguantas ~{{days}} días
  sin comprar"). `dashboard.foodCoverage.hint` ("Estimación basada en los productos de tu
  despensa") es un texto distinto, más genérico — no lo sustituye.
- `insights.activity.rotationHigh/Medium/Low` — ya existen (`insights.component.ts:125-127`),
  se reutilizan como texto de la pastilla en vez del badge actual.

## Qué NO cambia

- Los cálculos de Rotación y Clasificación (`computeActivityMetrics`, `computeDistribution`)
  no se tocan, solo su presentación.
- El endpoint/lógica PRO de Desperdicio (`InsightsLlmClientService`, desglose por categoría)
  no se toca.
- No se añade una 5ª tarjeta — se evaluó "coste estimado en €" y no hay datos de precio en
  el modelo; añadirlo sería tracking nuevo, no reorganización. Decisión de Fernando: quedarse
  con las 4.

## Verificación

- Domain: test-first para `classifyCoverageLevel` y `classifyWasteLevel` (funciones puras).
- `npx ng lint`, `node scripts/check-icons.mjs`, tests, `npx ng build --configuration production`.
- Verificar en navegador: las 4 tarjetas en orden, pastillas con los 3 colores en casos reales
  (desperdicio 0/1/3, cobertura baja/media/alta), selector de personas intacto, Clasificación
  sin pastilla pero con sus frases ya existentes.
