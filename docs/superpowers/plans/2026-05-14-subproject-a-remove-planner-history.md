# Sub-proyecto A — Eliminar Tabs Planificación e Historial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Planner and History tabs entirely, leaving a clean 3-tab nav (Dashboard · Pantry · List) ready for the Insights tab in Sub-project B.

**Architecture:** Two independent commits. Commit 1 removes all planner code (feature, services, models, constants, settings page, i18n). Commit 2 removes the history UI tab while preserving `history-event-manager.service.ts` and `history-event-log.service.ts` — these logging services are the data source for Insights PRO (Sub-project C). Strategy: remove barrel re-exports first to stop TypeScript cascade, then fix direct references in surviving files, then delete the folders.

**Tech Stack:** Angular 20 standalone components, Ionic 8, TypeScript, @ngx-translate i18n (6 languages: es/en/de/fr/it/pt).

---

## File Map

### Commit 1 — Planner

| File | Action |
|---|---|
| `src/app/features/planner/` (3 files) | Delete folder |
| `src/app/core/services/planner/` (5 files) | Delete folder |
| `src/app/core/models/planner/` (all files) | Delete folder |
| `src/app/core/constants/planner/` (2 files) | Delete folder |
| `src/app/features/settings/components/settings-ai/` (3 files) | Delete folder |
| `src/app/app.routes.ts` | Remove `/planner` and `/settings/ai` routes |
| `src/app/features/tabs/tabs.component.html` | Remove planner tab button |
| `src/app/core/models/index.ts` | Remove `export * from './planner'` |
| `src/app/core/services/index.ts` | Remove `export * from './planner'` |
| `src/app/core/constants/index.ts` | Remove `export * from './planner'` |
| `src/app/core/models/dashboard/insight.models.ts` | Remove `AgentEntryContext` import, remove `'agent'` CTA type variant from `InsightCta` + `InsightCtaDefinition`, remove `COOK_BEFORE_EXPIRY` from `InsightId` |
| `src/app/core/constants/dashboard/insights.constants.ts` | Remove `AgentEntryContext` import, delete `COOK_BEFORE_EXPIRY` insight block |
| `src/app/core/services/dashboard/dashboard-state.service.ts` | Remove `PlannerConversationStore` import + injection, remove `'agent'` CTA handler block |
| `src/app/core/models/settings/settings.model.ts` | Remove `plannerMemory?: string` |
| `src/app/core/constants/shared/shared.constants.ts` | Remove `plannerMemory: ''` from `DEFAULT_PREFERENCES` |
| `src/app/core/services/settings/settings-preferences.service.ts` | Remove `plannerMemoryLimit`, `ensurePlannerMemory()`, `plannerMemory` in `normalizePreferences()`, `PLANNER_MEMORY_MAX_LENGTH` import |
| `src/app/core/services/settings/settings-ai-state.service.ts` | Delete file |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` ×6 | Remove `agent` block, `settings.ai` keys, `insights.library.cookBeforeExpiry` keys |

### Commit 2 — History tab

| File | Action |
|---|---|
| `src/app/features/history/` (3 files) | Delete folder |
| `src/app/core/services/history/history-state.service.ts` | Delete file |
| `src/app/core/services/history/index.ts` | Delete file (was only re-exporting history-state) |
| `src/app/app.routes.ts` | Remove `/history` route |
| `src/app/features/tabs/tabs.component.html` | Remove history tab button |
| `src/app/core/services/index.ts` | Remove `export * from './history'` |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` ×6 | Remove `history` block |

---

## Task 1: Remove planner barrel re-exports and routes

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/features/tabs/tabs.component.html`
- Modify: `src/app/core/models/index.ts`
- Modify: `src/app/core/services/index.ts`
- Modify: `src/app/core/constants/index.ts`

- [ ] **Step 1: Remove `/planner` and `/settings/ai` routes from `app.routes.ts`**

Remove these two route objects:

```ts
      {
        path: 'planner',
        loadComponent: () =>
          import('@features/planner/planner.component').then(m => m.PlannerComponent),
      },
```

```ts
  {
    path: 'settings/ai',
    loadComponent: () =>
      import('@features/settings/components/settings-ai/settings-ai.component').then(m => m.SettingsAiComponent),
  },
```

- [ ] **Step 2: Remove planner tab button from tabs.component.html**

Remove:
```html
    <ion-tab-button tab="planner" [routerLink]="['/planner']">
      <ion-icon name="sparkles-outline"></ion-icon>
      <ion-label>{{ 'agent.title' | translate }}</ion-label>
    </ion-tab-button>
```

- [ ] **Step 3: Remove planner barrel from `core/models/index.ts`**

Remove the line:
```ts
export * from './planner';
```

- [ ] **Step 4: Remove planner barrel from `core/services/index.ts`**

Remove the line:
```ts
export * from './planner';
```

- [ ] **Step 5: Remove planner barrel from `core/constants/index.ts`**

Remove the line:
```ts
export * from './planner';
```

---

## Task 2: Clean up insight types and dashboard-state.service.ts

**Files:**
- Modify: `src/app/core/models/dashboard/insight.models.ts`
- Modify: `src/app/core/constants/dashboard/insights.constants.ts`
- Modify: `src/app/core/services/dashboard/dashboard-state.service.ts`

- [ ] **Step 1: Clean up `insight.models.ts`**

**Remove** line 1:
```ts
import type { AgentEntryContext } from '@core/models/planner';
```

**Remove** `COOK_BEFORE_EXPIRY` from the `InsightId` enum. Replace:
```ts
export enum InsightId {
  COOK_BEFORE_EXPIRY = 'cook_before_expiry',
  ADD_EXPIRY_DATES = 'add_expiry_dates',
  ORGANIZE_WITH_CATEGORIES = 'organize_with_categories',
  MISSING_FOODTYPE = 'missing_foodtype',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
}
```
with:
```ts
export enum InsightId {
  ADD_EXPIRY_DATES = 'add_expiry_dates',
  ORGANIZE_WITH_CATEGORIES = 'organize_with_categories',
  MISSING_FOODTYPE = 'missing_foodtype',
  PLAN_AND_SAVE_TIME = 'plan_and_save_time',
}
```

**Remove** the `'agent'` variant from `InsightCta`. Replace:
```ts
export type InsightCta =
  | {
      id: string;
      label: string;
      type: 'agent';
      entryContext: AgentEntryContext;
      prompt: string;
    }
  | {
      id: string;
      label: string;
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      label: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
    };
```
with:
```ts
export type InsightCta =
  | {
      id: string;
      label: string;
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      label: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
    };
```

**Remove** the `'agent'` variant from `InsightCtaDefinition`. Replace:
```ts
export type InsightCtaDefinition =
  | {
      id: string;
      labelKey: string;
      type: 'agent';
      entryContext: AgentEntryContext;
      promptKey: string;
    }
  | {
      id: string;
      labelKey: string;
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      labelKey: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
    };
```
with:
```ts
export type InsightCtaDefinition =
  | {
      id: string;
      labelKey: string;
      type: 'navigate';
      route: string;
    }
  | {
      id: string;
      labelKey: string;
      type: 'batch-edit';
      filter: BatchEditFilter;
      action?: BatchEditAction;
    };
```

- [ ] **Step 2: Clean up `insights.constants.ts`**

Remove line 1:
```ts
import { AgentEntryContext } from '@core/models/planner';
```

Remove the entire `COOK_BEFORE_EXPIRY` object from the `INSIGHTS_LIBRARY` array (lines 11–30):
```ts
  {
    id: InsightId.COOK_BEFORE_EXPIRY,
    titleKey: 'insights.library.cookBeforeExpiry.title',
    descriptionKey: 'insights.library.cookBeforeExpiry.description',
    category: InsightCategory.PREVENTIVE,
    priority: 1,
    audience: 'pro',
    predicate: context => context.expiringSoonItems.some(item => (item.quantity ?? 0) > 0),
    ctas: [
      {
        id: 'cook-before-expiry-cta',
        labelKey: 'insights.library.cookBeforeExpiry.cta',
        type: 'agent',
        entryContext: AgentEntryContext.INSIGHTS_RECIPES,
        promptKey: 'insights.library.cookBeforeExpiry.prompt',
      },
    ],
  },
```

- [ ] **Step 3: Clean up `dashboard-state.service.ts`**

Remove line 15:
```ts
import { PlannerConversationStore } from '../planner/planner-conversation.store';
```

Remove the injection (around line 70):
```ts
  private readonly conversationStore = inject(PlannerConversationStore);
```

In the `onInsightAction()` method, the final block that falls through to the planner is the `'agent'` CTA handler. Remove these lines (approximately 416–420):
```ts
    this.conversationStore.prepareConversation({
      entryContext: cta.entryContext,
      initialPrompt: cta.prompt,
    });
    await this.navCtrl.navigateForward('/planner');
```

The method now ends after the `'batch-edit'` handler returns. The updated full method body:
```ts
  async onInsightAction(_: Insight, cta: InsightCta): Promise<void> {
    if (!cta) {
      return;
    }
    if (cta.type === 'navigate') {
      if (cta.route) {
        await this.navCtrl.navigateForward(cta.route);
      }
      return;
    }
    if (cta.type === 'batch-edit') {
      this.batchEdit.openFlow({ filter: cta.filter, action: cta.action });
      return;
    }
  }
```

---

## Task 3: Remove plannerMemory from settings model and preferences service

**Files:**
- Modify: `src/app/core/models/settings/settings.model.ts`
- Modify: `src/app/core/constants/shared/shared.constants.ts`
- Modify: `src/app/core/services/settings/settings-preferences.service.ts`
- Delete: `src/app/core/services/settings/settings-ai-state.service.ts`

- [ ] **Step 1: Remove `plannerMemory` from `settings.model.ts`**

Find `AppPreferences` interface and remove:
```ts
  plannerMemory?: string;
```

- [ ] **Step 2: Remove `plannerMemory` from `DEFAULT_PREFERENCES` in `shared.constants.ts`**

Find `DEFAULT_PREFERENCES` object and remove:
```ts
  plannerMemory: '',
```

- [ ] **Step 3: Clean up `settings-preferences.service.ts`**

Remove `PLANNER_MEMORY_MAX_LENGTH` from the import:
```ts
import {
  DEFAULT_PREFERENCES,
  DOC_TYPE_PREFERENCES,
  NEAR_EXPIRY_WINDOW_DAYS,
  PLANNER_MEMORY_MAX_LENGTH,   // ← remove this line
  STORAGE_KEYS,
} from '@core/constants';
```

Remove from the class body:
```ts
  private readonly plannerMemoryLimit = PLANNER_MEMORY_MAX_LENGTH;
```

In `normalizePreferences()`, remove:
```ts
      plannerMemory: this.ensurePlannerMemory(input?.plannerMemory),
```

Delete the entire `ensurePlannerMemory()` private method (lines 169–178):
```ts
  private ensurePlannerMemory(value?: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = normalizeTrim(value);
    if (!trimmed) {
      return '';
    }
    return trimmed.length > this.plannerMemoryLimit ? trimmed.slice(0, this.plannerMemoryLimit) : trimmed;
  }
```

- [ ] **Step 4: Delete `settings-ai-state.service.ts`**

Delete the file:
```
src/app/core/services/settings/settings-ai-state.service.ts
```

---

## Task 4: Delete planner folders and i18n — commit

**Files:**
- Delete: `src/app/features/planner/` (entire folder)
- Delete: `src/app/core/services/planner/` (entire folder)
- Delete: `src/app/core/models/planner/` (entire folder)
- Delete: `src/app/core/constants/planner/` (entire folder)
- Delete: `src/app/features/settings/components/settings-ai/` (entire folder)
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json` ×6

- [ ] **Step 1: Delete planner feature and service folders**

```bash
rm -rf src/app/features/planner
rm -rf src/app/core/services/planner
rm -rf src/app/core/models/planner
rm -rf src/app/core/constants/planner
rm -rf src/app/features/settings/components/settings-ai
```

- [ ] **Step 2: Verify TypeScript compiles cleanly (no new errors)**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts"
```

Expected: no output (no errors in `src/` except the pre-existing `core/index.ts` lines about `./database`, `./pro`, `./store`).

If errors appear, fix them before continuing.

- [ ] **Step 3: Remove i18n keys from all 6 language files**

For **each** of `src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`:

**a)** Remove the entire top-level `"agent"` key and its contents (was the planner tab namespace).

**b)** Remove `"ai"` from inside `"settings"`:
```json
"settings": {
  ...
  "ai": { ... }   ← remove this key
  ...
}
```

**c)** Remove `"cookBeforeExpiry"` from inside `"insights" → "library"`:
```json
"insights": {
  "library": {
    "cookBeforeExpiry": { ... }   ← remove this key
  }
}
```

Verify all 6 files are valid JSON after editing:
```bash
for f in src/assets/i18n/*.json; do python3 -c "import json; json.load(open('$f'))" && echo "$f OK"; done
```

Expected: 6 lines each ending with `OK`.

- [ ] **Step 4: Run tests**

```bash
npx ng test --watch=false 2>&1 | tail -5
```

Expected: all tests PASS (count ≥ 17).

- [ ] **Step 5: Commit planner removal**

```bash
git add -A
git commit -m "feat: remove planner tab, settings-ai page, and all planner services"
```

---

## Task 5: Remove history tab — routes, barrel, files, i18n — commit

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/features/tabs/tabs.component.html`
- Modify: `src/app/core/services/index.ts`
- Delete: `src/app/features/history/` (entire folder)
- Delete: `src/app/core/services/history/history-state.service.ts`
- Delete: `src/app/core/services/history/index.ts`
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json` ×6

> **IMPORTANT:** `history-event-log.service.ts` and `history-event-manager.service.ts` are NOT touched. They stay in `src/app/core/services/history/`. Only `history-state.service.ts` and `index.ts` are deleted from that folder.

- [ ] **Step 1: Remove `/history` route from `app.routes.ts`**

Remove:
```ts
      {
        path: 'history',
        loadComponent: () =>
          import('@features/history/history.component').then(m => m.HistoryComponent),
      },
```

- [ ] **Step 2: Remove history tab button from `tabs.component.html`**

Remove:
```html
    <ion-tab-button tab="history" [routerLink]="['/history']">
      <ion-icon name="time-outline"></ion-icon>
      <ion-label>{{ 'history.title' | translate }}</ion-label>
    </ion-tab-button>
```

- [ ] **Step 3: Remove history barrel from `core/services/index.ts`**

Remove the line:
```ts
export * from './history';
```

- [ ] **Step 4: Delete history UI files**

```bash
rm -rf src/app/features/history
rm src/app/core/services/history/history-state.service.ts
rm src/app/core/services/history/index.ts
```

Verify remaining history service files still exist:
```bash
ls src/app/core/services/history/
```

Expected:
```
history-event-log.service.ts
history-event-manager.service.ts
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts"
```

Expected: no output.

- [ ] **Step 6: Remove `"history"` i18n block from all 6 language files**

For each of `src/assets/i18n/es.json`, `en.json`, `de.json`, `fr.json`, `it.json`, `pt.json`:

Remove the entire top-level `"history"` key and its contents.

Verify valid JSON:
```bash
for f in src/assets/i18n/*.json; do python3 -c "import json; json.load(open('$f'))" && echo "$f OK"; done
```

Expected: 6 lines each ending with `OK`.

- [ ] **Step 7: Run tests**

```bash
npx ng test --watch=false 2>&1 | tail -5
```

Expected: all tests PASS.

- [ ] **Step 8: Commit history tab removal**

```bash
git add -A
git commit -m "feat: remove history tab (logging services preserved for Insights PRO)"
```

---

## Self-Review Checklist

- [x] `/planner` route removed from app.routes.ts
- [x] `/settings/ai` route removed from app.routes.ts
- [x] `/history` route removed from app.routes.ts
- [x] Both tab buttons removed from tabs.component.html
- [x] All 3 barrel re-exports removed (models, services, constants)
- [x] `InsightId.COOK_BEFORE_EXPIRY` removed from enum
- [x] `'agent'` CTA variant removed from `InsightCta` and `InsightCtaDefinition`
- [x] `COOK_BEFORE_EXPIRY` insight block removed from `INSIGHTS_LIBRARY`
- [x] `PlannerConversationStore` import + injection removed from dashboard-state
- [x] `'agent'` CTA handler block removed from `onInsightAction()`
- [x] `plannerMemory` removed from `AppPreferences`, `DEFAULT_PREFERENCES`, `normalizePreferences()`
- [x] `PLANNER_MEMORY_MAX_LENGTH` import + usage removed from preferences service
- [x] `settings-ai-state.service.ts` deleted
- [x] `settings-ai` component folder deleted
- [x] `history-event-log.service.ts` NOT deleted
- [x] `history-event-manager.service.ts` NOT deleted
- [x] `history-state.service.ts` deleted
- [x] `history/index.ts` deleted
- [x] `agent.*` i18n block removed ×6
- [x] `settings.ai.*` i18n keys removed ×6
- [x] `insights.library.cookBeforeExpiry.*` i18n keys removed ×6
- [x] `history.*` i18n block removed ×6
- [x] JSON validity verified after each i18n edit
- [x] TypeScript check passes after each commit (excluding pre-existing core/index.ts errors)
- [x] Tests pass after each commit
