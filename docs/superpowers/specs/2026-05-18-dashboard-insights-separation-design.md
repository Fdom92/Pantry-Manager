# Dashboard / Insights Separation — Design Spec

**Date:** 2026-05-18
**Status:** Approved

## Goal

Eliminate conceptual overlap between Dashboard and Insights tabs. Give each screen a single, clear identity:

- **Dashboard = Operate** → "What do I need to do right now?"
- **Insights = Understand** → "What do my habits and pantry say?"

---

## Dashboard (simplified)

### What stays

| Section | Purpose |
|---|---|
| Today's Suggestion | Single item to consume today — protagonist + secondaries + CTA |
| What to do now | Urgent/preventive actions: Expired, Near-Expiry, Low Stock, Stale |

### What gets removed

| Removed | Reason |
|---|---|
| Pantry Health banner (CRITICAL/ATTENTION/OPTIMAL) | Analytical → moves to Insights |
| Pantry Score (0–100) | Analytical → absorbed into Insights quality card |
| Food Coverage (days/months of supply) | Analytical → moves to Insights |
| "Improve your pantry" insight cards | Action-oriented but not urgent → deleted (signal visible via Insights quality card) |

### Template impact

`dashboard.component.html` loses ~180 lines. Layers 1 and 4 removed.

### Service impact

`DashboardStateService` removes `pantryHealth`, `pantryScore`, `foodCoverage` signals and the import of `DashboardInsightService`.

---

## Insights (expanded)

7 sections. Free users: sections 1–6. PRO users: all 7.

### Section 1 — Status banner

Thin colored banner at page top.

- **CRITICAL** (red): expired items present
- **ATTENTION** (orange): near-expiry or tracking gaps
- **OPTIMAL** (green): clean state

Source: `computePantryHealth()` — moves from `dashboard.domain.ts` to `insights-free.domain.ts`.

### Section 2 — "Tu despensa ahora"

4 metric cards in a 2×2 grid:

| Card | Value | Color |
|---|---|---|
| Activos | active count | neutral |
| Caducados | expired count | red if > 0 |
| Revisar | review count | orange if > 0 |
| Sin fecha | noExpiryDate count | warning if > 0 |

`basicsOutOfStock` removed from display (still computed internally for Dashboard actions).
`noExpiryDate` promoted from hint text → real 4th metric card.

### Section 3 — "Cobertura estimada"

Single card: "Tu despensa alcanza para X días / meses / años."

Source: `computeFoodCoverage()` — moves from `dashboard.domain.ts` to `insights-free.domain.ts`.

### Section 4 — "Últimos 30 días"

3-stat row: **Consumed · Expired · Waste %**
`Added` stat removed (low analytical value).

Rotation badge (replaces position of Added):
- `rotationRatio = consumed / activeInventory`
- **Alta** ≥ 0.3, **Media** ≥ 0.1, **Baja** < 0.1
- `null` if no active inventory → "Sin actividad"

### Section 5 — "Por tipo de alimento"

Horizontal bar chart with fixed food type order:
`Proteínas → Verduras → Frutas → Lácteos → Carbohidratos → Otros`

Two insight badges below bars:
- **Más desperdiciado:** `[FoodType]`
- **Menor rotación:** `[FoodType]`

`leastRotatingFoodType` added to `DistributionMetrics`.

### Section 6 — "Calidad del inventario"

Headline: **PantryScore** (0–100 + label: excellent / good / fair / poor).
Source: `computePantryScore()` — moves from `dashboard.domain.ts` to `insights-free.domain.ts`.

4 CSS progress bars (% of total):
- Con fecha
- Sin fecha
- Revisables
- Caducados

No CTAs in this card. Pure analytics.

### Section 7 — PRO AI Analysis (unchanged)

Generate / Loading skeleton / Stale refresh / 4 sections: patterns, problems, recommendations, suggestions.

---

## Architecture & Domain Changes

### Domain file: `insights-free.domain.ts`

**Functions absorbed from `dashboard.domain.ts`:**
- `computePantryHealth()` + `PantryHealth` / `PantryHealthState` types
- `computePantryScore()` + `PantryScoreResult` / `PantryScoreLabel` types
- `computeFoodCoverage()` + `FoodCoverageResult` / `FoodCoverageUnit` types

**Functions modified:**

```ts
// Gains activeInventory param; ActivityMetrics gains rotationRatio field
computeActivityMetrics(
  events: PantryEvent[],
  windowDays: number,
  now: Date,
  activeInventory: number
): ActivityMetrics

// ActivityMetrics new field:
rotationRatio: 'high' | 'medium' | 'low' | null
```

```ts
// DistributionMetrics gains leastRotatingFoodType field
computeDistribution(items, events, now, windowDays): DistributionMetrics

// DistributionMetrics new field:
leastRotatingFoodType: FoodType | null

// topFoodTypes sorted by fixed order (protein, vegetable, fruit, dairy, carb, other)
// not by count — "Otros" never appears first
```

**Functions deleted from `dashboard.domain.ts`:**
- `getRecentItemsByUpdatedAt()` — no longer needed

### Service: `InsightsStateService`

Gains 3 new computed signals:
```ts
readonly pantryHealth = computed(() =>
  computePantryHealth(this.pantryStore.items(), new Date()))

readonly pantryScore = computed(() =>
  computePantryScore(snapshot.expired, snapshot.nearExpiry, snapshot.noExpiryDate,
                     snapshot.lowStock, staleCount))

readonly foodCoverage = computed(() =>
  computeFoodCoverage(this.pantryStore.items()))
```

`activityMetrics` computed gains `this.inventorySnapshot().active` as 4th argument.

### Service: `DashboardStateService`

Removes: `pantryHealth`, `pantryScore`, `foodCoverage` signals + `DashboardInsightService` injection.

### Deleted files

| File | Reason |
|---|---|
| `core/services/dashboard/dashboard-insight.service.ts` | No longer used on either screen |
| `core/constants/dashboard/insights.constants.ts` | Verify no other usages before deleting |

`shared/components/insight-card/` component — keep file, remove from Dashboard providers array.

### i18n strategy

Reuse existing `dashboard.health.*`, `dashboard.pantryScore.*`, `dashboard.foodCoverage.*` keys from Insights template — no duplication needed.

New keys required:
```json
"insights": {
  "activity": {
    "rotation": "Rotación",
    "rotationHigh": "Rotación alta",
    "rotationMedium": "Rotación media",
    "rotationLow": "Rotación baja"
  },
  "quality": {
    "title": "Calidad del inventario",
    "withDate": "Con fecha",
    "noDate": "Sin fecha",
    "reviewable": "Revisables",
    "expired": "Caducados"
  },
  "distribution": {
    "leastRotating": "Menor rotación"
  }
}
```

---

## Visual Consistency Rules

- `expired` → `--ion-color-danger` (red)
- `review` → `--ion-color-warning` (orange)
- `near-expiry` → `--ion-color-warning` (yellow/orange)
- Progress bars: CSS only, no external charting libraries
- Same card padding/radius/shadow as existing insight sections
- Status banner: same styling as existing `metric-card--danger` / `metric-card--warning` patterns

---

## What Does NOT Change

- PRO AI analysis flow (LLM client, cache, payload builder)
- Dashboard actions (Expired, Near-Expiry, Low Stock, Stale)
- Today's Suggestion logic
- PouchDB / storage layer
- RevenueCat PRO gating
- All 6 languages (keys reused, new keys added in all locales)
