# Sub-proyecto A — Eliminar Tabs Planificación e Historial

**Fecha:** 2026-05-14
**Contexto:** Parte 1 de 3 del refactor hacia tab Insights. Elimina código del planner (recetas IA) y la tab de historial. Los servicios de logging de eventos sobreviven — son el input de Insights PRO (Sub-proyecto C).

**Resultado:** Nav queda con 3 tabs (Dashboard · Despensa · Lista) hasta que Sub-proyecto B añada Insights.

---

## Estrategia: 2 commits independientes

- **Commit 1:** Eliminar todo lo relacionado con Planner
- **Commit 2:** Eliminar tab Historial (UI only — servicios de logging se preservan)

---

## Commit 1: Eliminar Planner

### Carpetas eliminadas (borrar completas)

```
src/app/features/planner/
  planner.component.ts
  planner.component.html
  planner.component.scss

src/app/core/services/planner/
  planner.service.ts
  planner-state.service.ts
  planner-conversation.store.ts
  planner-llm-client.service.ts
  index.ts

src/app/core/models/planner/
  (todos los ficheros — LlmMessage, AgentEntryContext, etc.)

src/app/core/constants/planner/
  planner.constants.ts
  index.ts
```

### Página de settings eliminada

```
src/app/features/settings/components/settings-ai/
  settings-ai.component.ts
  settings-ai.component.html
  settings-ai.component.scss
```

Esta página solo gestiona `plannerMemory`. Se elimina junto con su ruta `/settings/ai`.

### Ficheros modificados

**`src/app/app.routes.ts`**
- Eliminar ruta `/planner`
- Eliminar ruta `/settings/ai`

**`src/app/features/tabs/tabs.component.html`**
- Eliminar `<ion-tab-button tab="planner">`

**`src/app/core/models/index.ts`**
- Eliminar `export * from './planner'`

**`src/app/core/services/index.ts`**
- Eliminar `export * from './planner'`

**`src/app/core/constants/index.ts`**
- Eliminar `export * from './planner'`

**`src/app/core/constants/dashboard/insights.constants.ts`**
- Eliminar import `AgentEntryContext` from `@core/models/planner`
- Eliminar insight `COOK_BEFORE_EXPIRY` (su CTA llama `conversationStore.prepareConversation` + navega a `/planner`)
- Mantener todos los demás insights (`ADD_EXPIRY_DATES`, `ORGANIZE_WITH_CATEGORIES`, `MISSING_FOODTYPE`, `PLAN_AND_SAVE_TIME`)

**`src/app/core/services/dashboard/dashboard-state.service.ts`**
- Eliminar `import { PlannerConversationStore }` (línea 15)
- Eliminar `private readonly conversationStore = inject(PlannerConversationStore)` (línea 70)
- En el método `onInsightCtaSelected()` (o equivalente), eliminar el bloque final que llama a `conversationStore.prepareConversation(...)` + `navigateForward('/planner')` (líneas 416-420). El método queda solo con los handlers `navigate` y `batch-edit`.

**`src/app/core/models/dashboard/insight.models.ts`**
- Eliminar `COOK_BEFORE_EXPIRY` del enum `InsightId`

**`src/app/core/services/settings/settings-ai-state.service.ts`**
- Eliminar fichero completo (solo gestiona `plannerMemory`)

**`src/app/core/models/settings/settings.model.ts`**
- Eliminar campo `plannerMemory?: string`

**`src/app/core/services/settings/settings-preferences.service.ts`**
- Eliminar campo `plannerMemory` de la interfaz/lógica de preferencias
- Eliminar método `ensurePlannerMemory()` y la constante `plannerMemoryLimit`

**`src/assets/i18n/*.json` (×6: es, en, de, fr, it, pt)**
- Eliminar bloque `agent` completo (era el namespace de la tab planner)
- Eliminar claves `settings.ai.*` (página eliminada)
- Eliminar claves `insights.library.cookBeforeExpiry.*`

---

## Commit 2: Eliminar Tab Historial

### Carpetas eliminadas

```
src/app/features/history/
  history.component.ts
  history.component.html
  history.component.scss

src/app/core/services/history/history-state.service.ts
```

### Sobreviven (no tocar)

```
src/app/core/services/history/history-event-log.service.ts    ✅
src/app/core/services/history/history-event-manager.service.ts ✅
src/app/core/domain/events/                                    ✅
src/app/core/models/events/                                    ✅
```

Estos servicios siguen registrando eventos silenciosamente. Son el input de Insights PRO.

### Ficheros modificados

**`src/app/app.routes.ts`**
- Eliminar ruta `/history`

**`src/app/features/tabs/tabs.component.html`**
- Eliminar `<ion-tab-button tab="history">`

**`src/app/core/services/history/index.ts`**
- Eliminar `export * from './history-state.service'`
- El fichero queda vacío — puede eliminarse si el barrel `core/services/index.ts` ya no lo re-exporta

**`src/app/core/services/index.ts`**
- Eliminar `export * from './history'` (o la línea que re-exporta el barrel history)

**`src/assets/i18n/*.json` (×6)**
- Eliminar bloque `history` completo

---

## Invariantes

1. `history-event-manager.service.ts` no se toca en ningún commit
2. `history-event-log.service.ts` no se toca en ningún commit
3. El backend (`backend/src/`) no cambia — se refactoriza en Sub-proyecto C
4. `InsightId` enum mantiene todos los valores excepto `COOK_BEFORE_EXPIRY`
5. Rutas `/pantry`, `/dashboard`, `/list` sin cambios
6. `ng test` pasa después de cada commit

---

## Verificación TypeScript

Después de cada commit, ejecutar:
```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts"
```
Solo son aceptables los errores preexistentes en `core/index.ts` (módulos `./database`, `./pro`, `./store` — son preexistentes, no introducidos por este cambio).
