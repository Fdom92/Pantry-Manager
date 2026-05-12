# List Redesign 4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la lista de la compra de pantalla read-only a flujo de reposición automático: tap = comprado + inventario actualizado, swipe = eliminar, comprado temporal in-memory, chips de razón, urgency sort dentro de grupos por supermercado.

**Architecture:** Opción A — extender `ListStateService` en sitio, sin nuevos servicios. Señales efímeras en el servicio (boughtItemIds, removedAutoIds, manualItems, boughtManuals), limpiadas en `ionViewWillLeave`. Computed `shoppingAnalysis` incorpora lógica de filtrado y urgencia. `buildShoppingAnalysis` filtra comprados/eliminados, llama al grouping util actualizado, y rellena `boughtItems` por grupo.

**Tech Stack:** Angular 20 signals, Ionic 8 (`ion-item-sliding`, `ion-item-options`, `AlertController`), PouchDB via `PantryStoreService.addNewLot()`, @ngx-translate, Karma/Jasmine (para domain puras).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `core/models/list/list.model.ts` | Modify | Añadir `BoughtItem`, `ManualItem`, ampliar `ShoppingReason`, actualizar `ShoppingSuggestionGroup`, `ShoppingSummary` |
| `core/domain/list/list.domain.ts` | Modify | Añadir `URGENCY_WEIGHT`, `sortSuggestionsByUrgency`, actualizar `determineSuggestionNeed` para frescos |
| `core/utils/list-grouping.util.ts` | Modify | Inicializar `boughtItems: []` en cada grupo devuelto |
| `core/services/list/list-state.service.ts` | Modify | Nuevas señales, `buildShoppingAnalysis` con filtros, métodos de acción |
| `features/list/list.component.ts` | Modify | Añadir `AlertController`, `ionViewWillLeave`, helpers de collapse |
| `features/list/list.component.html` | Modify | Reescritura: `ion-item-sliding`, chips, sección comprado, FAB |
| `features/list/list.component.scss` | Modify | Estilos bought, chips, collapsible, FAB |
| `src/assets/i18n/es.json` | Modify | Nuevas claves shopping (chips, bought, manualAdd, emptyState) |
| `src/assets/i18n/en.json` | Modify | Traducción inglés |
| `src/assets/i18n/de.json` | Modify | Traducción alemán |
| `src/assets/i18n/fr.json` | Modify | Traducción francés |
| `src/assets/i18n/it.json` | Modify | Traducción italiano |
| `src/assets/i18n/pt.json` | Modify | Traducción portugués |

---

## Task 1: Model changes

**Files:**
- Modify: `src/app/core/models/list/list.model.ts`

- [ ] **Step 1: Replace the full content of `list.model.ts`**

```typescript
import type { PantryItem } from '../pantry';

export enum ShoppingReason {
  EMPTY       = 'empty',
  BELOW_MIN   = 'below-min',
  FRESH_EMPTY = 'fresh-empty',
  MANUAL      = 'manual',
}

export interface BoughtItem {
  id: string;
  name: string;
  supermarket?: string;
}

export interface ManualItem {
  id: string;
  name: string;
}

export type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
export type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
export type ShoppingStateWithItem = ShoppingState<PantryItem>;

export interface ShoppingSuggestion<TItem = string> {
  item: TItem;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
  supermarket?: string;
}

export interface ShoppingSuggestionGroup<TItem = string> {
  key: string;
  label: string;
  suggestions: ShoppingSuggestion<TItem>[];
  boughtItems: BoughtItem[];
}

export interface ShoppingSummary {
  total: number;
  belowMin: number;
  empty: number;
  supermarketCount: number;
  boughtCount: number;
}

export interface ShoppingState<TItem = string> {
  suggestions: ShoppingSuggestion<TItem>[];
  groupedSuggestions: ShoppingSuggestionGroup<TItem>[];
  summary: ShoppingSummary;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

Expected: cero errores en `list.model.ts`. Puede haber errores en otros ficheros que usan `ShoppingSuggestionGroup` sin `boughtItems` — se resuelven en tareas siguientes.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/list/list.model.ts
git commit -m "feat(list): extend model with BoughtItem, ManualItem, ShoppingReason.FRESH_EMPTY"
```

---

## Task 2: Domain logic changes

**Files:**
- Modify: `src/app/core/domain/list/list.domain.ts`

- [ ] **Step 1: Replace the full content of `list.domain.ts`**

```typescript
import { roundQuantity } from '@core/utils/formatting.util';
import { ShoppingReason, type ShoppingSummary, type ShoppingSuggestionWithItem } from '@core/models/list';

export const URGENCY_WEIGHT: Record<ShoppingReason, number> = {
  [ShoppingReason.FRESH_EMPTY]: 1,
  [ShoppingReason.EMPTY]:       2,
  [ShoppingReason.BELOW_MIN]:   3,
  [ShoppingReason.MANUAL]:      4,
};

export function determineSuggestionNeed(params: {
  totalQuantity: number;
  minThreshold: number | null;
  isFresh?: boolean;
}): { reason: ShoppingReason | null; suggestedQuantity: number } {
  const { totalQuantity, minThreshold, isFresh } = params;

  if (totalQuantity <= 0) {
    const reason = isFresh ? ShoppingReason.FRESH_EMPTY : ShoppingReason.EMPTY;
    return { reason, suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold ?? 1) };
  }

  if (minThreshold != null && totalQuantity < minThreshold) {
    return {
      reason: ShoppingReason.BELOW_MIN,
      suggestedQuantity: ensureMinimumSuggestedQuantity(minThreshold - totalQuantity, minThreshold),
    };
  }

  return { reason: null, suggestedQuantity: 0 };
}

export function sortSuggestionsByUrgency(
  suggestions: ShoppingSuggestionWithItem[]
): ShoppingSuggestionWithItem[] {
  return [...suggestions].sort(
    (a, b) => (URGENCY_WEIGHT[a.reason] ?? 99) - (URGENCY_WEIGHT[b.reason] ?? 99)
  );
}

export function incrementSummary(summary: ShoppingSummary, reason: ShoppingReason): ShoppingSummary {
  switch (reason) {
    case ShoppingReason.BELOW_MIN:
      return { ...summary, belowMin: summary.belowMin + 1 };
    case ShoppingReason.EMPTY:
    case ShoppingReason.FRESH_EMPTY:
      return { ...summary, empty: summary.empty + 1 };
    default:
      return summary;
  }
}

export function ensureMinimumSuggestedQuantity(value: number, fallback?: number): number {
  const rounded = roundQuantity(value);
  if (rounded > 0) {
    return rounded;
  }
  if (fallback != null && fallback > 0) {
    return roundQuantity(fallback);
  }
  return 1;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errores en `list.domain.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/domain/list/list.domain.ts
git commit -m "feat(list): add URGENCY_WEIGHT, sortSuggestionsByUrgency, FRESH_EMPTY reason"
```

---

## Task 3: Grouping util — inicializar boughtItems

**Files:**
- Modify: `src/app/core/utils/list-grouping.util.ts`

- [ ] **Step 1: Replace the full content of `list-grouping.util.ts`**

```typescript
import { UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';
import type { ShoppingSuggestionGroupWithItem, ShoppingSuggestionWithItem } from '@core/models/list';
import { normalizeLowercase } from './normalization.util';

export function groupSuggestionsBySupermarket(params: {
  suggestions: ShoppingSuggestionWithItem[];
  labelForUnassigned: string;
}): ShoppingSuggestionGroupWithItem[] {
  const map = new Map<string, ShoppingSuggestionWithItem[]>();
  for (const suggestion of params.suggestions) {
    const key = normalizeLowercase(suggestion.supermarket) || UNASSIGNED_SUPERMARKET_KEY;
    const list = map.get(key);
    if (list) {
      list.push(suggestion);
    } else {
      map.set(key, [suggestion]);
    }
  }

  const groups = Array.from(map.entries()).map(([key, list]) => {
    const label =
      key === UNASSIGNED_SUPERMARKET_KEY
        ? params.labelForUnassigned
        : list[0]?.supermarket ?? params.labelForUnassigned;
    return { key, label, suggestions: list, boughtItems: [] };
  });

  return groups.sort((a, b) => {
    if (a.key === UNASSIGNED_SUPERMARKET_KEY) return 1;
    if (b.key === UNASSIGNED_SUPERMARKET_KEY) return -1;
    return a.label.localeCompare(b.label);
  });
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/app/core/utils/list-grouping.util.ts
git commit -m "feat(list): initialize boughtItems array in groupSuggestionsBySupermarket"
```

---

## Task 4: Service — señales y computed actualizado

**Files:**
- Modify: `src/app/core/services/list/list-state.service.ts`

- [ ] **Step 1: Reemplazar la parte de imports y señales del servicio**

Reemplaza desde la línea 1 hasta el final del constructor (antes de los métodos) con:

```typescript
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SHOPPING_LIST_NAME, UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';
import {
  determineSuggestionNeed,
  incrementSummary,
  sortSuggestionsByUrgency,
} from '@core/domain/list';
import { groupSuggestionsBySupermarket } from '@core/utils/list-grouping.util';
import { formatIsoTimestampForFilename } from '@core/domain/settings';
import type { PantryItem } from '@core/models/pantry';
import {
  type BoughtItem,
  type ManualItem,
  type ShoppingStateWithItem,
  type ShoppingSuggestionGroupWithItem,
  type ShoppingSuggestionWithItem,
  type ShoppingSummary,
  ShoppingReason,
} from '@core/models/list';
import { FRESH_QTY } from '@core/domain/pantry/fresh.domain';
import { LanguageService } from '../shared/language.service';
import { createLatestOnlyRunner, SkeletonLoadingManager, withSignalFlag } from '@core/utils';
import { DownloadService, ShareService, shouldSkipShareOutcome } from '../shared';
import { formatDateTimeValue, formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import { normalizeLowercase, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { PantryStoreService } from '../pantry/pantry-store.service';

@Injectable()
export class ListStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareTask = createLatestOnlyRunner(this.destroyRef);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly download = inject(DownloadService);
  private readonly share = inject(ShareService);

  readonly isSharingListInProgress = signal(false);

  // Ephemeral state — cleared on ionViewWillLeave
  readonly boughtItemIds  = signal<Set<string>>(new Set());
  readonly removedAutoIds = signal<Set<string>>(new Set());
  readonly manualItems    = signal<ManualItem[]>([]);
  readonly boughtManuals  = signal<BoughtItem[]>([]);

  readonly shoppingAnalysis = computed<ShoppingStateWithItem>(() => {
    return this.buildShoppingAnalysis(
      this.items(),
      this.boughtItemIds(),
      this.removedAutoIds(),
      this.manualItems(),
      this.boughtManuals(),
    );
  });

  readonly loading = this.pantryStore.loading;
  readonly items = this.pantryStore.loadedProducts;

  private readonly skeletonManager = new SkeletonLoadingManager();
  readonly showSkeleton = this.skeletonManager.showSkeleton;
```

- [ ] **Step 2: Reemplazar el método `ionViewWillEnter` y añadir `ionViewWillLeave`**

Después de `readonly showSkeleton`, reemplaza/añade:

```typescript
  async ionViewWillEnter(): Promise<void> {
    this.skeletonManager.startLoading();
    await this.pantryStore.loadAll();
    this.skeletonManager.stopLoading();
  }

  async ionViewWillLeave(): Promise<void> {
    this.boughtItemIds.set(new Set());
    this.removedAutoIds.set(new Set());
    this.manualItems.set([]);
    this.boughtManuals.set([]);
  }
```

- [ ] **Step 3: Reemplazar el método `buildShoppingAnalysis` con la versión nueva**

Reemplaza el método privado `buildShoppingAnalysis` existente con:

```typescript
  private buildShoppingAnalysis(
    items: PantryItem[],
    boughtIds: Set<string>,
    removedIds: Set<string>,
    manualItems: ManualItem[],
    boughtManuals: BoughtItem[],
  ): ShoppingStateWithItem {
    const pendingSuggestions: ShoppingSuggestionWithItem[] = [];
    const boughtAutoItems: BoughtItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    let summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      empty: 0,
      supermarketCount: 0,
      boughtCount: 0,
    };

    for (const item of items) {
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);

      const shouldAutoAdd = this.pantryStore.shouldAutoAddToShoppingList(item, {
        totalQuantity,
        minThreshold,
      });

      if (!shouldAutoAdd) {
        continue;
      }

      const supermarket = normalizeSupermarketValue(item.supermarket);
      const id = item._id;

      if (boughtIds.has(id)) {
        boughtAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
        summary.boughtCount += 1;
        continue;
      }

      if (removedIds.has(id)) {
        continue;
      }

      const { reason, suggestedQuantity } = determineSuggestionNeed({
        totalQuantity,
        minThreshold,
        isFresh: item.productType === 'fresh',
      });

      if (reason) {
        if (supermarket) {
          uniqueSupermarkets.add(normalizeLowercase(supermarket));
        }
        pendingSuggestions.push({
          item,
          reason,
          suggestedQuantity,
          currentQuantity: roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
          supermarket: supermarket || undefined,
        });
        summary = incrementSummary(summary, reason);
      }
    }

    summary.total = pendingSuggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    summary.boughtCount += boughtManuals.length;

    const unassignedLabel = this.translate.instant('shopping.unassignedSupermarket');
    const groupedSuggestions = groupSuggestionsBySupermarket({
      suggestions: pendingSuggestions,
      labelForUnassigned: unassignedLabel,
    });

    // Sort pending items within each group by urgency
    for (const group of groupedSuggestions) {
      group.suggestions = sortSuggestionsByUrgency(group.suggestions);
    }

    // Distribute bought auto items into their supermarket groups
    for (const boughtItem of boughtAutoItems) {
      const groupKey = normalizeLowercase(boughtItem.supermarket) || UNASSIGNED_SUPERMARKET_KEY;
      const group = groupedSuggestions.find(g => g.key === groupKey);
      if (group) {
        group.boughtItems.push(boughtItem);
      } else {
        groupedSuggestions.push({
          key: groupKey,
          label: boughtItem.supermarket ?? unassignedLabel,
          suggestions: [],
          boughtItems: [boughtItem],
        });
      }
    }

    return { suggestions: pendingSuggestions, groupedSuggestions, summary };
  }
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

Expected: sin errores en el servicio.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/list/list-state.service.ts
git commit -m "feat(list): add ephemeral signals and update buildShoppingAnalysis with bought/removed logic"
```

---

## Task 5: Service — métodos de acción

**Files:**
- Modify: `src/app/core/services/list/list-state.service.ts`

- [ ] **Step 1: Añadir los métodos de acción antes de `getSuggestionTrackId`**

```typescript
  async markAsBought(suggestion: ShoppingSuggestionWithItem): Promise<void> {
    const id = suggestion.item._id;
    this.boughtItemIds.update(set => new Set([...set, id]));

    const qty = suggestion.reason === ShoppingReason.FRESH_EMPTY
      ? FRESH_QTY.sufficient
      : suggestion.suggestedQuantity;

    try {
      await this.pantryStore.addNewLot(id, { quantity: qty });
    } catch (err) {
      console.error('[ListStateService] markAsBought: addNewLot failed', err);
      // Revert optimistic update
      this.boughtItemIds.update(set => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }

  markManualAsBought(id: string): void {
    const item = this.manualItems().find(m => m.id === id);
    if (!item) return;
    this.manualItems.update(list => list.filter(m => m.id !== id));
    this.boughtManuals.update(list => [...list, { id, name: item.name }]);
  }

  removeAutoItem(id: string): void {
    this.removedAutoIds.update(set => new Set([...set, id]));
  }

  removeManualItem(id: string): void {
    this.manualItems.update(list => list.filter(m => m.id !== id));
  }

  restoreFromBought(id: string): void {
    this.boughtItemIds.update(set => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    this.boughtManuals.update(list => list.filter(b => b.id !== id));
  }

  addManualItem(name: string): void {
    const id = crypto.randomUUID();
    this.manualItems.update(list => [...list, { id, name }]);
  }
```

- [ ] **Step 2: Verificar que `getSuggestionTrackId` sigue en el servicio**

El método existente debe quedar intacto:

```typescript
  getSuggestionTrackId(suggestion: ShoppingSuggestionWithItem): string {
    return suggestion.item?._id ?? suggestion.item?.name ?? 'item';
  }
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/list/list-state.service.ts
git commit -m "feat(list): add markAsBought, markManualAsBought, removeAutoItem, removeManualItem, restoreFromBought, addManualItem"
```

---

## Task 6: i18n — nuevas claves

**Files:**
- Modify: `src/assets/i18n/es.json`
- Modify: `src/assets/i18n/en.json`
- Modify: `src/assets/i18n/de.json`
- Modify: `src/assets/i18n/fr.json`
- Modify: `src/assets/i18n/it.json`
- Modify: `src/assets/i18n/pt.json`

- [ ] **Step 1: Añadir claves a `es.json`**

Dentro del objeto `"shopping"`, añadir después de `"share": { ... }`:

```json
"chips": {
  "freshEmpty": "Fresco agotado",
  "empty": "Agotado",
  "belowMin": "Stock bajo",
  "basic": "Básico"
},
"bought": {
  "sectionTitle": "Comprado",
  "restore": "Restaurar",
  "count": "{{count}} comprado"
},
"manualAdd": {
  "sectionTitle": "Otros",
  "placeholder": "Nombre del producto",
  "alertTitle": "Añadir a la lista",
  "alertButton": "Añadir"
},
"emptyState": {
  "autoHint": "Los productos agotados aparecerán aquí automáticamente."
},
"suggestions": {
  "belowMinQty": "Faltan {{qty}} para el mínimo"
}
```

Nota: la clave `shopping.suggestions` ya existe, solo añadir `belowMinQty` dentro de ella (no reemplazar el objeto entero).

- [ ] **Step 2: Añadir claves a `en.json`**

```json
"chips": {
  "freshEmpty": "Fresh — out of stock",
  "empty": "Out of stock",
  "belowMin": "Low stock",
  "basic": "Staple"
},
"bought": {
  "sectionTitle": "Bought",
  "restore": "Restore",
  "count": "{{count}} bought"
},
"manualAdd": {
  "sectionTitle": "Other",
  "placeholder": "Product name",
  "alertTitle": "Add to list",
  "alertButton": "Add"
},
"emptyState": {
  "autoHint": "Out-of-stock items will appear here automatically."
},
"suggestions": {
  "belowMinQty": "{{qty}} short of minimum"
}
```

- [ ] **Step 3: Añadir claves a `de.json`**

```json
"chips": {
  "freshEmpty": "Frisch — leer",
  "empty": "Aufgebraucht",
  "belowMin": "Wenig Vorrat",
  "basic": "Grundprodukt"
},
"bought": {
  "sectionTitle": "Gekauft",
  "restore": "Wiederherstellen",
  "count": "{{count}} gekauft"
},
"manualAdd": {
  "sectionTitle": "Sonstige",
  "placeholder": "Produktname",
  "alertTitle": "Zur Liste hinzufügen",
  "alertButton": "Hinzufügen"
},
"emptyState": {
  "autoHint": "Aufgebrauchte Produkte erscheinen hier automatisch."
},
"suggestions": {
  "belowMinQty": "Noch {{qty}} bis zum Minimum"
}
```

- [ ] **Step 4: Añadir claves a `fr.json`**

```json
"chips": {
  "freshEmpty": "Frais épuisé",
  "empty": "Épuisé",
  "belowMin": "Stock bas",
  "basic": "Essentiel"
},
"bought": {
  "sectionTitle": "Acheté",
  "restore": "Restaurer",
  "count": "{{count}} acheté"
},
"manualAdd": {
  "sectionTitle": "Autres",
  "placeholder": "Nom du produit",
  "alertTitle": "Ajouter à la liste",
  "alertButton": "Ajouter"
},
"emptyState": {
  "autoHint": "Les produits épuisés apparaîtront ici automatiquement."
},
"suggestions": {
  "belowMinQty": "Il manque {{qty}} pour le minimum"
}
```

- [ ] **Step 5: Añadir claves a `it.json`**

```json
"chips": {
  "freshEmpty": "Fresco esaurito",
  "empty": "Esaurito",
  "belowMin": "Scorta bassa",
  "basic": "Prodotto base"
},
"bought": {
  "sectionTitle": "Acquistato",
  "restore": "Ripristina",
  "count": "{{count}} acquistato"
},
"manualAdd": {
  "sectionTitle": "Altri",
  "placeholder": "Nome prodotto",
  "alertTitle": "Aggiungi alla lista",
  "alertButton": "Aggiungi"
},
"emptyState": {
  "autoHint": "I prodotti esauriti appariranno qui automaticamente."
},
"suggestions": {
  "belowMinQty": "Mancano {{qty}} al minimo"
}
```

- [ ] **Step 6: Añadir claves a `pt.json`**

```json
"chips": {
  "freshEmpty": "Fresco esgotado",
  "empty": "Esgotado",
  "belowMin": "Estoque baixo",
  "basic": "Produto básico"
},
"bought": {
  "sectionTitle": "Comprado",
  "restore": "Restaurar",
  "count": "{{count}} comprado"
},
"manualAdd": {
  "sectionTitle": "Outros",
  "placeholder": "Nome do produto",
  "alertTitle": "Adicionar à lista",
  "alertButton": "Adicionar"
},
"emptyState": {
  "autoHint": "Os produtos esgotados aparecerão aqui automaticamente."
},
"suggestions": {
  "belowMinQty": "Faltam {{qty}} para o mínimo"
}
```

- [ ] **Step 7: Run TypeScript check y commit**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -20
git add src/assets/i18n/
git commit -m "feat(list): add i18n keys for chips, bought section, manual add, empty state"
```

---

## Task 7: Component — TypeScript

**Files:**
- Modify: `src/app/features/list/list.component.ts`

- [ ] **Step 1: Reemplazar el contenido completo de `list.component.ts`**

```typescript
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListStateService } from '@core/services/list/list-state.service';
import { AlertController, IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  providers: [ListStateService],
})
export class ListComponent {
  readonly facade = inject(ListStateService);
  private readonly alertController = inject(AlertController);
  private readonly translate = inject(TranslateService);

  private readonly collapsedGroups = new Set<string>();
  private readonly collapsedBoughtSections = new Set<string>();

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  async ionViewWillLeave(): Promise<void> {
    await this.facade.ionViewWillLeave();
    this.collapsedGroups.clear();
    this.collapsedBoughtSections.clear();
  }

  toggleGroup(key: string): void {
    if (this.collapsedGroups.has(key)) {
      this.collapsedGroups.delete(key);
    } else {
      this.collapsedGroups.add(key);
    }
  }

  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups.has(key);
  }

  toggleBoughtSection(key: string): void {
    if (this.collapsedBoughtSections.has(key)) {
      this.collapsedBoughtSections.delete(key);
    } else {
      this.collapsedBoughtSections.add(key);
    }
  }

  isBoughtSectionExpanded(key: string): boolean {
    return this.collapsedBoughtSections.has(key);
  }

  async openManualAdd(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('shopping.manualAdd.alertTitle'),
      inputs: [
        {
          type: 'text',
          placeholder: this.translate.instant('shopping.manualAdd.placeholder'),
        },
      ],
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('shopping.manualAdd.alertButton'),
          handler: (data: Record<number, string>) => {
            const name = (data[0] ?? '').trim();
            if (name) {
              this.facade.addManualItem(name);
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/app/features/list/list.component.ts
git commit -m "feat(list): add AlertController, collapse helpers, ionViewWillLeave, openManualAdd"
```

---

## Task 8: Component — HTML template

**Files:**
- Modify: `src/app/features/list/list.component.html`

- [ ] **Step 1: Reemplazar el contenido completo de `list.component.html`**

```html
<ion-header>
  <ion-toolbar>
    <ion-title>{{ 'shopping.title' | translate }}</ion-title>
    <ion-buttons slot="end">
      <ion-button [routerLink]="['/settings']" [attr.aria-label]="'settings.title' | translate">
        <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>

<ion-content class="ion-padding">
  @let state = facade.shoppingAnalysis();

  @if (facade.loading()) {
    <div class="suggestion-groups">
      @for (placeholder of [0, 1, 2]; track placeholder) {
        <div class="skeleton-item">
          <ion-skeleton-text animated style="width: 120px; height: 17px;"></ion-skeleton-text>
          <ion-skeleton-text animated style="width: 60px; height: 14px;"></ion-skeleton-text>
        </div>
      }
    </div>
  } @else if (!state.summary.total && !state.summary.boughtCount && !facade.manualItems().length) {
    <app-empty-state
      class="list-empty-state"
      icon="cart-outline"
      [iconColor]="'warning'"
      [titleKey]="'emptyStates.shopping.title'"
      [subtitle]="'shopping.emptyState.autoHint' | translate">
    </app-empty-state>
  } @else {
    <div class="suggestion-groups fade-in-list">

      @for (group of state.groupedSuggestions; track group.key) {
        @if (group.suggestions.length || group.boughtItems.length) {
          <div class="suggestion-group">

            <!-- Group header -->
            <button class="supermarket-heading pressable" (click)="toggleGroup(group.key)">
              <span>{{ group.label }}</span>
              @if (group.suggestions.length) {
                <ion-badge color="medium" class="group-count">{{ group.suggestions.length }}</ion-badge>
              }
              <ion-icon
                class="collapse-icon"
                [name]="isGroupCollapsed(group.key) ? 'chevron-forward-outline' : 'chevron-down-outline'">
              </ion-icon>
            </button>

            @if (!isGroupCollapsed(group.key)) {

              <!-- Pending items -->
              @if (group.suggestions.length) {
                <ion-list class="item-list" lines="none">
                  @for (suggestion of group.suggestions; track facade.getSuggestionTrackId(suggestion)) {
                    <ion-item-sliding>
                      <ion-item
                        button
                        detail="false"
                        class="suggestion-item pressable"
                        (click)="facade.markAsBought(suggestion)">
                        <div class="item-body" slot="start">
                          <span class="item-name">{{ suggestion.item.name }}</span>
                          <div class="item-meta">
                            @if (suggestion.reason === 'fresh-empty') {
                              <ion-badge color="success" class="reason-chip">
                                🥬 {{ 'shopping.chips.freshEmpty' | translate }}
                              </ion-badge>
                            } @else if (suggestion.reason === 'empty') {
                              <ion-badge color="danger" class="reason-chip">
                                {{ 'shopping.chips.empty' | translate }}
                              </ion-badge>
                            } @else if (suggestion.reason === 'below-min') {
                              <ion-badge color="warning" class="reason-chip">
                                {{ 'shopping.chips.belowMin' | translate }}
                              </ion-badge>
                            }
                            @if (suggestion.item.isBasic) {
                              <ion-badge color="primary" class="reason-chip reason-chip--basic">
                                ⭐ {{ 'shopping.chips.basic' | translate }}
                              </ion-badge>
                            }
                          </div>
                          <span class="item-qty">
                            @if (suggestion.reason === 'below-min') {
                              {{ 'shopping.suggestions.belowMinQty' | translate:{ qty: suggestion.suggestedQuantity } }}
                            } @else {
                              {{ 'shopping.suggestions.toBuy' | translate:{ amount: suggestion.suggestedQuantity } }}
                            }
                          </span>
                        </div>
                        <ion-icon slot="end" name="cart-outline" color="medium" class="cart-icon"></ion-icon>
                      </ion-item>
                      <ion-item-options side="end">
                        <ion-item-option
                          color="danger"
                          (click)="facade.removeAutoItem(suggestion.item._id)">
                          <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                        </ion-item-option>
                      </ion-item-options>
                    </ion-item-sliding>
                  }
                </ion-list>
              }

              <!-- Bought items for this group -->
              @if (group.boughtItems.length) {
                <div class="bought-section">
                  <button
                    class="bought-section-header pressable"
                    (click)="toggleBoughtSection(group.key)">
                    <ion-icon name="checkmark-circle-outline" color="success"></ion-icon>
                    <span>{{ 'shopping.bought.sectionTitle' | translate }}</span>
                    <ion-badge color="success" class="group-count">{{ group.boughtItems.length }}</ion-badge>
                    <ion-icon
                      class="collapse-icon"
                      [name]="isBoughtSectionExpanded(group.key) ? 'chevron-down-outline' : 'chevron-forward-outline'">
                    </ion-icon>
                  </button>

                  @if (isBoughtSectionExpanded(group.key)) {
                    <ion-list class="item-list bought-list" lines="none">
                      @for (bought of group.boughtItems; track bought.id) {
                        <ion-item-sliding>
                          <ion-item class="bought-item" detail="false">
                            <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
                            <span class="item-name bought-name">{{ bought.name }}</span>
                          </ion-item>
                          <ion-item-options side="start">
                            <ion-item-option (click)="facade.restoreFromBought(bought.id)">
                              <ion-icon slot="icon-only" name="arrow-undo-outline"></ion-icon>
                            </ion-item-option>
                          </ion-item-options>
                        </ion-item-sliding>
                      }
                    </ion-list>
                  }
                </div>
              }

            }
          </div>
        }
      }

      <!-- Manual items section -->
      @if (facade.manualItems().length || facade.boughtManuals().length) {
        <div class="suggestion-group">
          <div class="supermarket-heading manual-heading">
            <span>{{ 'shopping.manualAdd.sectionTitle' | translate }}</span>
          </div>

          @if (facade.manualItems().length) {
            <ion-list class="item-list" lines="none">
              @for (manual of facade.manualItems(); track manual.id) {
                <ion-item-sliding>
                  <ion-item
                    button
                    detail="false"
                    class="suggestion-item pressable"
                    (click)="facade.markManualAsBought(manual.id)">
                    <span slot="start" class="item-name">{{ manual.name }}</span>
                    <ion-icon slot="end" name="cart-outline" color="medium" class="cart-icon"></ion-icon>
                  </ion-item>
                  <ion-item-options side="end">
                    <ion-item-option color="danger" (click)="facade.removeManualItem(manual.id)">
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-item-option>
                  </ion-item-options>
                </ion-item-sliding>
              }
            </ion-list>
          }

          @if (facade.boughtManuals().length) {
            <div class="bought-section">
              <button
                class="bought-section-header pressable"
                (click)="toggleBoughtSection('__manual__')">
                <ion-icon name="checkmark-circle-outline" color="success"></ion-icon>
                <span>{{ 'shopping.bought.sectionTitle' | translate }}</span>
                <ion-badge color="success" class="group-count">{{ facade.boughtManuals().length }}</ion-badge>
                <ion-icon
                  class="collapse-icon"
                  [name]="isBoughtSectionExpanded('__manual__') ? 'chevron-down-outline' : 'chevron-forward-outline'">
                </ion-icon>
              </button>
              @if (isBoughtSectionExpanded('__manual__')) {
                <ion-list class="item-list bought-list" lines="none">
                  @for (bought of facade.boughtManuals(); track bought.id) {
                    <ion-item detail="false" class="bought-item">
                      <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
                      <span class="item-name bought-name">{{ bought.name }}</span>
                    </ion-item>
                  }
                </ion-list>
              }
            </div>
          }
        </div>
      }

    </div>
  }

  <!-- Share button (secondary action) -->
  @if (!facade.loading() && state.summary.total) {
    <div class="share-row">
      <ion-button
        fill="clear"
        color="medium"
        size="small"
        (click)="facade.shareShoppingListReport()"
        [disabled]="facade.isSharingListInProgress()">
        @if (facade.isSharingListInProgress()) {
          <ion-spinner slot="start" name="lines-small"></ion-spinner>
        } @else {
          <ion-icon slot="start" name="share-outline"></ion-icon>
        }
        {{ 'shopping.share.button' | translate }}
      </ion-button>
    </div>
  }

</ion-content>

<ion-fab slot="fixed" vertical="bottom" horizontal="end">
  <ion-fab-button
    size="small"
    color="medium"
    (click)="openManualAdd()"
    [attr.aria-label]="'shopping.manualAdd.alertTitle' | translate">
    <ion-icon name="add-outline"></ion-icon>
  </ion-fab-button>
</ion-fab>
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/app/features/list/list.component.html
git commit -m "feat(list): rewrite template with swipe gestures, reason chips, bought sections, manual FAB"
```

---

## Task 9: Component — SCSS

**Files:**
- Modify: `src/app/features/list/list.component.scss`

- [ ] **Step 1: Añadir los nuevos estilos al final del fichero SCSS existente**

Añadir al final de `list.component.scss`:

```scss
// --- Item list (replaces cards) ---
.item-list {
  background: transparent;
  --ion-item-background: var(--app-theme-card-bg);
  border-radius: var(--app-theme-card-border-radius);
  overflow: hidden;
  border: 1px solid var(--app-theme-card-border-color);
}

.suggestion-item {
  --padding-start: var(--app-theme-spacing-lg);
  --padding-end: var(--app-theme-spacing-lg);
  --inner-padding-end: 0;
  cursor: pointer;
}

.item-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--app-theme-spacing-sm) 0;
  flex: 1;
}

.item-name {
  font-size: 1rem;
  font-weight: var(--app-theme-font-weight-bold);
  color: var(--app-theme-text-color);
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.item-qty {
  font-size: 0.85rem;
  color: var(--app-theme-text-muted);
  margin-top: 2px;
}

.cart-icon {
  font-size: 1.2rem;
  opacity: 0.4;
}

// --- Reason chips ---
.reason-chip {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 20px;
  height: auto;
  line-height: 1.4;
}

.reason-chip--basic {
  --background: transparent;
  --color: var(--ion-color-medium);
  border: 1px solid var(--ion-color-medium);
}

// --- Supermarket heading ---
.supermarket-heading {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-sm);
  font-size: 1.05rem;
  font-weight: var(--app-theme-font-weight-bold);
  color: var(--app-theme-text-color);
  padding: var(--app-theme-spacing-xs) 0;
}

.manual-heading {
  cursor: default;
}

.group-count {
  font-size: 0.75rem;
}

.collapse-icon {
  margin-left: auto;
  font-size: 1rem;
  color: var(--app-theme-text-muted);
}

// --- Bought section ---
.bought-section {
  margin-top: var(--app-theme-spacing-sm);
}

.bought-section-header {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: var(--app-theme-spacing-sm);
  font-size: 0.9rem;
  color: var(--app-theme-text-muted);
  padding: var(--app-theme-spacing-xs) 0;
}

.bought-list {
  opacity: 0.6;
}

.bought-item {
  --padding-start: var(--app-theme-spacing-lg);
}

.bought-name {
  font-weight: var(--app-theme-font-weight-normal, 400);
  text-decoration: line-through;
  color: var(--app-theme-text-muted);
}

// --- Share row ---
.share-row {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--app-theme-spacing-md);
}

// --- FAB override ---
ion-fab-button[size="small"] {
  --box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 2: Run full TypeScript check final**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | head -60
```

Expected: cero errores.

- [ ] **Step 3: Commit final**

```bash
git add src/app/features/list/list.component.scss
git commit -m "feat(list): add styles for item-list, chips, bought section, collapse, FAB"
```

---

## Self-review checklist

### Spec coverage

| Requisito de spec | Tarea que lo implementa |
|---|---|
| Tap = marcar comprado | Task 5 (`markAsBought`), Task 8 (click handler) |
| Swipe izquierda = eliminar | Task 8 (`ion-item-options side="end"`) |
| Swipe derecha = restaurar | Task 8 (`ion-item-options side="start"`) |
| Inventario auto-actualizado | Task 5 (`pantryStore.addNewLot`) |
| Frescos restaurados a "Suficiente" | Task 5 (`FRESH_QTY.sufficient`) |
| Sección Comprado temporal | Task 4 (señales), Task 8 (template) |
| Comprado se limpia al salir | Task 4 (`ionViewWillLeave`) |
| Chips de razón | Task 8 (badges), Task 6 (i18n) |
| Urgency sort dentro de grupos | Task 2 (`sortSuggestionsByUrgency`), Task 4 (aplicado) |
| Grupos supermercado colapsables | Task 7 (`toggleGroup`), Task 8 (template) |
| Contador de grupo | Task 8 (badge en heading) |
| Cantidades en lenguaje natural | Task 8 (`belowMinQty` vs `toBuy`) |
| Ítems manuales texto libre | Task 5 (`addManualItem`), Task 7 (`openManualAdd`) |
| FAB secundario para manual | Task 8 (`ion-fab`) |
| Empty state | Task 8, Task 6 (`emptyState.autoHint`) |
| Multi-add mantenido como secundario | Share button movido a posición secundaria (Task 8) |
| `FRESH_EMPTY` como reason | Task 1 (modelo), Task 2 (domain), Task 4 (servicio) |

### Sin placeholders: verificado ✓

### Consistencia de tipos

- `ShoppingSuggestionWithItem` = `ShoppingSuggestion<PantryItem>` — usada consistentemente en Tasks 4, 5, 7, 8
- `BoughtItem.id` en Task 5: auto usa `item._id`, manual usa `crypto.randomUUID()` — coherente con `ManualItem.id`
- `group.boughtItems` inicializado en Task 3 como `[]`, rellenado en Task 4 — consistente
- `URGENCY_WEIGHT` exportado en Task 2, importado en Task 2 mismo via `sortSuggestionsByUrgency` — consistente
- `addNewLot(id, { quantity })` — signature verificada en `pantry-store.service.ts`: `{ quantity: number; expiryDate?: string; ... }` — correcto
