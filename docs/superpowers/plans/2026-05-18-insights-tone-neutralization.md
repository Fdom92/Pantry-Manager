# Insights Tone Neutralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all alert-style visual and linguistic indicators from the Insights tab so it reads as purely analytical/descriptive — no red/yellow banners, no alert classes on metric cards, neutral badge colors, neutral i18n text.

**Architecture:** Presentation-layer only. Template removes alert CSS modifier classes and the status banner block. SCSS removes color variants for rotation and distribution badges and the banner styles. Component TS drops unused `PantryHealthState` references. i18n keys updated to neutral language in all 6 locales. No domain logic changes.

**Tech Stack:** Angular 20, Ionic 8, SCSS, @ngx-translate (en, es, de, fr, it, pt)

---

## File Map

| Action | Path |
|---|---|
| Modify | `src/app/features/insights/insights.component.html` |
| Modify | `src/app/features/insights/insights.component.ts` |
| Modify | `src/app/features/insights/insights.component.scss` |
| Modify | `src/assets/i18n/en.json` |
| Modify | `src/assets/i18n/es.json` |
| Modify | `src/assets/i18n/de.json` |
| Modify | `src/assets/i18n/fr.json` |
| Modify | `src/assets/i18n/it.json` |
| Modify | `src/assets/i18n/pt.json` |

---

### Task 1: Remove status banner + alert classes from Insights template

**Files:**
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Step 1: Remove the status banner section**

In `src/app/features/insights/insights.component.html`, delete the entire Section 1 block:

```html
<!-- DELETE this entire block: -->
      <!-- SECTION 1: Status banner -->
      <section class="insights-status-banner" [attr.data-state]="facade.pantryHealthState()">
        <ion-icon [name]="getPantryHealthIcon(facade.pantryHealthState())"></ion-icon>
        <span>{{ 'insights.status.' + facade.pantryHealthState() | translate }}</span>
      </section>
```

- [ ] **Step 2: Remove alert modifier classes from snapshot metric cards**

In the same file, find the snapshot grid section. Replace the three metric cards that have conditional alert classes:

```html
<!-- BEFORE -->
          <div class="metric-card" [class.metric-card--danger]="facade.inventorySnapshot().expired > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().expired }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.expired' | translate }}</span>
          </div>
          <div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().review > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().review }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.review' | translate }}</span>
          </div>
          ...
          <div class="metric-card" [class.metric-card--warning]="facade.inventorySnapshot().noExpiryDate > 0">
            <span class="metric-card__value">{{ facade.inventorySnapshot().noExpiryDate }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.noDate' | translate }}</span>
          </div>

<!-- AFTER (remove the [class.metric-card--*] bindings, keep everything else) -->
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().expired }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.expired' | translate }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().review }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.review' | translate }}</span>
          </div>
          ...
          <div class="metric-card">
            <span class="metric-card__value">{{ facade.inventorySnapshot().noExpiryDate }}</span>
            <span class="metric-card__label">{{ 'insights.snapshot.noDate' | translate }}</span>
          </div>
```

- [ ] **Step 3: Remove color modifier classes from distribution badges**

Find the distribution badges section and remove the `--waste` and `--rotation` modifiers:

```html
<!-- BEFORE -->
            @if (facade.distribution().mostWastedFoodType) {
              <p class="distribution-badge distribution-badge--waste">

            @if (facade.distribution().leastRotatingFoodType) {
              <p class="distribution-badge distribution-badge--rotation">

<!-- AFTER -->
            @if (facade.distribution().mostWastedFoodType) {
              <p class="distribution-badge">

            @if (facade.distribution().leastRotatingFoodType) {
              <p class="distribution-badge">
```

- [ ] **Step 4: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -10
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/insights/insights.component.html
git commit -m "refactor(insights): remove alert banner and alert CSS classes from template"
```

---

### Task 2: Clean up insights.component.ts — remove PantryHealthState

**Files:**
- Modify: `src/app/features/insights/insights.component.ts`

- [ ] **Step 1: Remove PantryHealthState import and usages**

Replace the current file content with the cleaned version (removing `PantryHealthState` import, the constant, and `getPantryHealthIcon`):

```ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  IonButtons,
} from '@ionic/angular/standalone';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { FoodType } from '@core/models/shared/enums.model';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonSkeletonText,
    IonButtons,
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  readonly FoodType = FoodType;

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getQualityBarWidth(count: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((count / total) * 100)}%`;
  }

  getMaxFoodTypeCount(): number {
    const foodTypes = this.facade.distribution().foodTypes;
    if (!foodTypes.length) return 0;
    return Math.max(...foodTypes.map(f => f.count));
  }

  getRotationLabel(ratio: 'high' | 'medium' | 'low' | null): string {
    if (ratio === null) return 'insights.activity.rotationNone';
    return `insights.activity.rotation${ratio.charAt(0).toUpperCase()}${ratio.slice(1)}`;
  }

  getFoodTypeLabel(foodType: FoodType): string {
    const map: Record<FoodType, string> = {
      [FoodType.PROTEIN]:   'Proteínas',
      [FoodType.CARB]:      'Carbohidratos',
      [FoodType.VEGETABLE]: 'Verduras',
      [FoodType.FRUIT]:     'Fruta',
      [FoodType.DAIRY]:     'Lácteos',
      [FoodType.HOUSEHOLD]: 'Hogar',
      [FoodType.OTHER]:     'Otros',
    };
    return map[foodType] ?? foodType;
  }

  readonly proSections = [
    { key: 'patterns',        icon: 'analytics-outline',  labelKey: 'insights.pro.sections.patterns' },
    { key: 'problems',        icon: 'warning-outline',    labelKey: 'insights.pro.sections.problems' },
    { key: 'recommendations', icon: 'bulb-outline',       labelKey: 'insights.pro.sections.recommendations' },
    { key: 'suggestions',     icon: 'calendar-outline',   labelKey: 'insights.pro.sections.suggestions' },
  ] as const;

  getAnalysisSection(key: string): string[] {
    const a = this.facade.proAnalysis();
    if (!a) return [];
    return (a as unknown as Record<string, string[]>)[key] ?? [];
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/insights/insights.component.ts
git commit -m "refactor(insights): remove PantryHealthState from component"
```

---

### Task 3: Neutralize alert styles in SCSS

**Files:**
- Modify: `src/app/features/insights/insights.component.scss`

- [ ] **Step 1: Delete `.insights-status-banner` block**

Find and remove the entire `.insights-status-banner { ... }` block that starts with:

```scss
// Status banner
.insights-status-banner {
  display: flex;
  ...
  &[data-state='critical'] { ... }
  &[data-state='attention'] { ... }
  &[data-state='optimal'] { ... }
}
```

Delete it entirely (the block and its `// Status banner` comment).

- [ ] **Step 2: Neutralize `.rotation-badge` color variants**

Find the `.rotation-badge` block and replace it:

```scss
// BEFORE:
.rotation-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  background: var(--ion-item-background);
  color: var(--ion-color-medium);

  &[data-level='high']   { background: rgba(var(--ion-color-success-rgb), 0.12); color: var(--ion-color-success-shade); }
  &[data-level='medium'] { background: rgba(var(--ion-color-warning-rgb), 0.12); color: var(--ion-color-warning-shade); }
  &[data-level='low']    { background: rgba(var(--ion-color-danger-rgb),  0.10); color: var(--ion-color-danger); }
}

// AFTER (remove [data-level] variants entirely):
.rotation-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  background: var(--ion-item-background);
  color: var(--ion-color-medium);
}
```

- [ ] **Step 3: Neutralize `.distribution-badge` color variants**

Find the `.distribution-badge` block and replace it:

```scss
// BEFORE:
.distribution-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--ion-color-medium);

  &--waste    { color: var(--ion-color-danger); }
  &--rotation { color: var(--ion-color-warning-shade); }
}

// AFTER (remove color variants):
.distribution-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--ion-color-medium);
}
```

- [ ] **Step 4: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -10
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/insights/insights.component.scss
git commit -m "refactor(insights): neutralize alert colors in SCSS"
```

---

### Task 4: Update i18n to neutral language (all 6 languages)

**Files:**
- Modify: `src/assets/i18n/en.json`
- Modify: `src/assets/i18n/es.json`
- Modify: `src/assets/i18n/de.json`
- Modify: `src/assets/i18n/fr.json`
- Modify: `src/assets/i18n/it.json`
- Modify: `src/assets/i18n/pt.json`

- [ ] **Step 1: Update en.json**

In `src/assets/i18n/en.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Expired items in inventory",
  "attention": "Items to review",
  "optimal": "Inventory up to date"
},

// In "insights" > "distribution":
"distribution": {
  "title": "By food type",
  "mostWasted": "Higher incidence",
  "leastRotating": "Low rotation"
},
```

- [ ] **Step 2: Update es.json**

In `src/assets/i18n/es.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Caducados en inventario",
  "attention": "Productos a revisar",
  "optimal": "Inventario al día"
},

// In "insights" > "distribution":
"distribution": {
  "title": "Por tipo de alimento",
  "mostWasted": "Mayor incidencia",
  "leastRotating": "Baja rotación"
},
```

- [ ] **Step 3: Update de.json**

In `src/assets/i18n/de.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Abgelaufene im Vorrat",
  "attention": "Produkte zu prüfen",
  "optimal": "Vorrat aktuell"
},

// In "insights" > "distribution":
"distribution": {
  "title": "Nach Lebensmitteltyp",
  "mostWasted": "Häufiger abgelaufen",
  "leastRotating": "Niedrige Rotation"
},
```

- [ ] **Step 4: Update fr.json**

In `src/assets/i18n/fr.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Périmés en stock",
  "attention": "Produits à vérifier",
  "optimal": "Inventaire à jour"
},

// In "insights" > "distribution":
"distribution": {
  "title": "Par type d'aliment",
  "mostWasted": "Incidence élevée",
  "leastRotating": "Faible rotation"
},
```

- [ ] **Step 5: Update it.json**

In `src/assets/i18n/it.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Scaduti in magazzino",
  "attention": "Prodotti da verificare",
  "optimal": "Inventario aggiornato"
},

// In "insights" > "distribution":
"distribution": {
  "title": "Per tipo di cibo",
  "mostWasted": "Incidenza maggiore",
  "leastRotating": "Bassa rotazione"
},
```

- [ ] **Step 6: Update pt.json**

In `src/assets/i18n/pt.json`, within the `"insights"` object:

```json
// In "insights" > "status":
"status": {
  "critical": "Expirados no inventário",
  "attention": "Produtos a verificar",
  "optimal": "Inventário atualizado"
},

// In "insights" > "distribution":
"distribution": {
  "title": "Por tipo de alimento",
  "mostWasted": "Maior incidência",
  "leastRotating": "Baixa rotação"
},
```

- [ ] **Step 7: Verify build clean**

```bash
npx ng build --configuration development 2>&1 | grep -E "ERROR|error TS" | head -10
```
Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
npx ng test --watch=false 2>&1 | tail -5
```
Expected: all tests PASS (85 total).

- [ ] **Step 9: Commit**

```bash
git add src/assets/i18n/
git commit -m "feat(i18n): neutralize insights alert language (6 languages)"
```
