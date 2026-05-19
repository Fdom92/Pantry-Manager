# Insights Tone Neutralization — Design Spec

**Date:** 2026-05-18
**Status:** Approved

## Goal

Remove all alert-style visual and linguistic indicators from the Insights tab so it reads as purely analytical/descriptive. Dashboard retains urgency language and alert colors. Despensa remains neutral inventory view.

## Rule

| Tab | Tone | Colors |
|---|---|---|
| Dashboard | Action + urgency | danger/warning allowed |
| Insights | Analytical + descriptive | neutral only |
| Despensa | Neutral inventory | context-appropriate |

---

## Template Changes (`insights.component.html`)

### Remove status banner (Section 1)
Delete the entire `<section class="insights-status-banner">` block.

### Snapshot metric cards — remove alert classes
```html
<!-- BEFORE -->
<div class="metric-card" [class.metric-card--danger]="facade.inventorySnapshot().expired > 0">
<div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().review > 0">
<div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().noExpiryDate > 0">

<!-- AFTER -->
<div class="metric-card">   (all three)
```

### Distribution badges — remove color modifier classes
```html
<!-- BEFORE -->
<p class="distribution-badge distribution-badge--waste">
<p class="distribution-badge distribution-badge--rotation">

<!-- AFTER -->
<p class="distribution-badge">   (both)
```

---

## Component Changes (`insights.component.ts`)

Remove:
- `import { PantryHealthState } from '@core/domain/insights/insights-free.domain'`
- `readonly PantryHealthState = PantryHealthState;`
- `getPantryHealthIcon(state: PantryHealthState): string` method

Keep: `InsightsStateService.pantryHealthState` signal (used in PRO LLM payload context, just not displayed).

---

## SCSS Changes (`insights.component.scss`)

### Delete `.insights-status-banner` block entirely

### `.rotation-badge` — neutralize all levels
```scss
// BEFORE: [data-level='high'] success, [data-level='medium'] warning, [data-level='low'] danger
// AFTER: single neutral style, no data-level variants
.rotation-badge {
  // keep base styles (inline-flex, padding, border-radius, font-size, font-weight)
  // remove all [data-level] color rules
  background: var(--ion-item-background);
  color: var(--ion-color-medium);
}
```

### `.distribution-badge` — remove color variants
```scss
// DELETE: &--waste and &--rotation color rules
// Single neutral color: var(--ion-color-medium)
```

### `.quality-score` — keep colored score value (approved exception)
No change to quality-score color variants.

---

## i18n Changes (6 languages)

### `insights.distribution.mostWasted`
| Lang | Before | After |
|---|---|---|
| en | "Most expired" | "Higher incidence" |
| es | "Más caducados" | "Mayor incidencia" |
| de | "Meiste abgelaufen" | "Häufiger abgelaufen" |
| fr | "Plus périmés" | "Incidence élevée" |
| it | "Più scaduti" | "Incidenza maggiore" |
| pt | "Mais expirados" | "Maior incidência" |

### `insights.distribution.leastRotating`
| Lang | Before | After |
|---|---|---|
| en | "Lowest rotation" | "Low rotation" |
| es | "Menor rotación" | "Baja rotación" |
| de | "Geringste Rotation" | "Niedrige Rotation" |
| fr | "Moins de rotation" | "Faible rotation" |
| it | "Rotazione minore" | "Bassa rotazione" |
| pt | "Menor rotação" | "Baixa rotação" |

### `insights.status.*` — update to neutral phrasing (keys stay)
| Lang | critical | attention | optimal |
|---|---|---|---|
| en | "Expired items in inventory" | "Items to review" | "Inventory up to date" |
| es | "Caducados en inventario" | "Productos a revisar" | "Inventario al día" |
| de | "Abgelaufene im Vorrat" | "Produkte zu prüfen" | "Vorrat aktuell" |
| fr | "Périmés en stock" | "Produits à vérifier" | "Inventaire à jour" |
| it | "Scaduti in magazzino" | "Prodotti da verificare" | "Inventario aggiornato" |
| pt | "Expirados no inventário" | "Produtos a verificar" | "Inventário atualizado" |

---

## What Does NOT Change

- `DashboardStateService` — unchanged
- `dashboard.component.html` — unchanged (alert colors stay)
- `InsightsStateService.pantryHealthState` signal — kept, not displayed
- `quality-score` color variants — kept (score value coloring is acceptable)
- PRO analysis section — unchanged
- All domain functions — unchanged
