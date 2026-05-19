# Sub-proyecto C — Insights PRO (IA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PRO teaser in the Insights tab with a real AI analysis endpoint — the backend receives a structured event payload, calls OpenAI with JSON mode, and returns patterns/problems/recommendations/suggestions cached locally for 24h.

**Architecture:** New backend endpoint `POST /insights/analyze` (JSON, not SSE). A new `InsightsLlmClientService` on the frontend calls it with `fetch` and parses the JSON. The result is stored in PouchDB via `InsightsCacheStorageService` with a 24h TTL. `InsightsStateService` gains three new signals (`proAnalysis`, `proAnalysisLoading`, `proAnalysisError`) and a `triggerProAnalysis()` method. The Insights component section D switches between a teaser (non-PRO), generate button (PRO, no cache), loading skeleton, analysis cards, and error state.

**Tech Stack:** Angular 20 + Ionic 8 (frontend), Express + OpenAI Node SDK (backend), TypeScript, PouchDB (cache), Karma/Jasmine tests.

---

## File Map

| File | Action |
|---|---|
| `backend/src/services/openai.service.ts` | Modify — add `createCompletion()` non-streaming method |
| `backend/src/controllers/insights.controller.ts` | **Create** |
| `backend/src/routes/insights.routes.ts` | **Create** |
| `backend/src/app.ts` | Modify — register `/insights` route |
| `src/environments/environment.model.ts` | Modify — add `insightsApiUrl` |
| `src/environments/environment.ts` | Modify — add dev URL |
| `src/environments/environment.prod.ts` | Modify — add prod URL |
| `src/app/core/models/insights/insights-analysis.model.ts` | **Create** — interfaces |
| `src/app/core/services/insights/insights-cache-storage.service.ts` | **Create** — PouchDB cache adapter |
| `src/app/core/services/insights/insights-llm-client.service.ts` | **Create** — HTTP client |
| `src/app/core/services/insights/insights-state.service.ts` | Modify — PRO signals + cache + triggerProAnalysis() |
| `src/app/features/insights/insights.component.ts` | Modify — proSections, getAnalysisSection(), generateAnalysis() |
| `src/app/features/insights/insights.component.html` | Modify — replace section D |
| `src/app/features/insights/insights.component.scss` | Modify — PRO analysis styles |
| `src/assets/i18n/{es,en,de,fr,it,pt}.json` ×6 | Modify — replace/extend `insights.pro.*` keys |

---

## Task 1: Backend — `openaiService.createCompletion()`

**Files:**
- Modify: `backend/src/services/openai.service.ts`

- [ ] **Step 1: Add `createCompletion` to `openai.service.ts`**

Read the file. After the closing `}` of `createStream`, add a new method to the `openaiService` object:

```ts
  async createCompletion(payload: { system: string; userMessage: string }): Promise<string> {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: payload.model ?? model,
      messages: [
        { role: 'system', content: String(payload.system) },
        { role: 'user', content: String(payload.userMessage) },
      ],
      response_format: { type: 'json_object' },
      stream: false,
    });
    return response.choices[0]?.message?.content ?? '{}';
  },
```

- [ ] **Step 2: Typecheck backend**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors (or same pre-existing errors as before).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/openai.service.ts
git commit -m "feat(backend): add openaiService.createCompletion for JSON non-streaming requests"
```

---

## Task 2: Backend — insights controller + route + register

**Files:**
- Create: `backend/src/controllers/insights.controller.ts`
- Create: `backend/src/routes/insights.routes.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create `insights.controller.ts`**

```ts
import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `Eres un asistente de análisis de despensa doméstica. Analiza los datos y devuelve ÚNICAMENTE un JSON válido con este formato exacto:

{"patterns":[],"problems":[],"recommendations":[],"suggestions":[]}

Reglas: máximo 3 ítems por sección, mínimo 1. Cada ítem: frase corta y accionable. Sin texto fuera del JSON. Idioma: español.`;

function buildUserMessage(events: any[], snapshot: any): string {
  const addedCount = events.filter((e: any) => e.eventType === 'ADD').length;
  const consumedCount = events.filter((e: any) => e.eventType === 'CONSUME').length;
  const expiredCount = events.filter((e: any) => e.eventType === 'EXPIRE').length;

  const topAdded = (() => {
    const counts: Record<string, number> = {};
    events.filter((e: any) => e.eventType === 'ADD' && e.foodType).forEach((e: any) => {
      counts[e.foodType] = (counts[e.foodType] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'N/A';
  })();

  const topExpired = (() => {
    const counts: Record<string, number> = {};
    events.filter((e: any) => e.eventType === 'EXPIRE' && e.foodType).forEach((e: any) => {
      counts[e.foodType] = (counts[e.foodType] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'ninguno';
  })();

  return `INVENTARIO ACTUAL:
- Total: ${snapshot.total} productos
- Caducados: ${snapshot.expired}
- En revisión: ${snapshot.review}
- Próximos a caducar: ${snapshot.nearExpiry}
- Básicos sin stock: ${snapshot.basicsOutOfStock}

ACTIVIDAD ÚLTIMOS 30 DÍAS (${events.length} eventos):
- Añadidos: ${addedCount}
- Consumidos: ${consumedCount}
- Caducados sin usar: ${expiredCount}
- Tipos más añadidos: ${topAdded}
- Tipos más caducados: ${topExpired}`;
}

function validateAnalysis(parsed: any): boolean {
  return (
    parsed &&
    Array.isArray(parsed.patterns) &&
    Array.isArray(parsed.problems) &&
    Array.isArray(parsed.recommendations) &&
    Array.isArray(parsed.suggestions)
  );
}

export const insightsController = {
  async analyze(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId || 'unknown';
    const body = req.body ?? {};

    if (!body.events || !body.snapshot) {
      res.status(400).json({ error: 'PAYLOAD_REQUIRED' });
      return;
    }

    const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    const snapshot = body.snapshot;

    logger.info('Insights analyze request', { userId, eventCount: events.length });

    const userMessage = buildUserMessage(events, snapshot);

    let content: string;
    try {
      content = await openaiService.createCompletion({ system: SYSTEM_PROMPT, userMessage });
    } catch (err: any) {
      logger.error('OpenAI completion failed', { userId, error: err.message });
      if (err.status === 429) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED' });
      } else if (err.code === 'ECONNABORTED' || err.name === 'AbortError') {
        res.status(504).json({ error: 'TIMEOUT' });
      } else if (err.status && err.status >= 500) {
        res.status(502).json({ error: 'OPENAI_ERROR' });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('Failed to parse OpenAI JSON response', { userId, content });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    if (!validateAnalysis(parsed)) {
      logger.error('OpenAI response missing required keys', { userId });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    res.json({
      analysis: {
        patterns: parsed.patterns.slice(0, 3),
        problems: parsed.problems.slice(0, 3),
        recommendations: parsed.recommendations.slice(0, 3),
        suggestions: parsed.suggestions.slice(0, 3),
        generatedAt: new Date().toISOString(),
      },
    });
  },
};
```

- [ ] **Step 2: Create `insights.routes.ts`**

```ts
import { Router } from 'express';
import { insightsController } from '../controllers/insights.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';
import { agentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/analyze', verifyPro, agentRateLimiter, insightsController.analyze);

export default router;
```

- [ ] **Step 3: Register route in `backend/src/app.ts`**

Read the file. After the line `import agentRoutes from './routes/agent.routes.js';`, add:

```ts
import insightsRoutes from './routes/insights.routes.js';
```

After the line `app.use('/agent', agentRoutes);`, add:

```ts
app.use('/insights', insightsRoutes);
```

- [ ] **Step 4: Typecheck backend**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/insights.controller.ts \
        backend/src/routes/insights.routes.ts \
        backend/src/app.ts
git commit -m "feat(backend): add POST /insights/analyze endpoint — event payload → OpenAI JSON → analysis"
```

---

## Task 3: Frontend — Models + Environments

**Files:**
- Create: `src/app/core/models/insights/insights-analysis.model.ts`
- Modify: `src/environments/environment.model.ts`
- Modify: `src/environments/environment.ts`
- Modify: `src/environments/environment.prod.ts`

- [ ] **Step 1: Create `insights-analysis.model.ts`**

```ts
export interface InsightsAnalysis {
  patterns: string[];
  problems: string[];
  recommendations: string[];
  suggestions: string[];
  generatedAt: string;
}

export interface InsightsAnalysisPayload {
  events: Array<{
    eventType: 'ADD' | 'CONSUME' | 'EXPIRE';
    foodType?: string;
    timestamp: string;
    productName?: string;
  }>;
  snapshot: {
    total: number;
    expired: number;
    review: number;
    nearExpiry: number;
    basicsOutOfStock: number;
  };
}

export interface InsightsAnalysisCache {
  readonly _id: 'insights-analysis-cache';
  _rev?: string;
  readonly type: 'insights_cache';
  analysis: InsightsAnalysis;
  readonly createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add `insightsApiUrl` to `environment.model.ts`**

Read the file. Add `insightsApiUrl: string;` to the `Environment` interface.

- [ ] **Step 3: Add URL to `environment.ts`**

Read the file. Add to the environment object:
```ts
insightsApiUrl: 'https://pantry-manager-develop.onrender.com/insights/analyze',
```

- [ ] **Step 4: Add URL to `environment.prod.ts`**

Read the file. Add to the environment object:
```ts
insightsApiUrl: 'https://pantry-manager.onrender.com/insights/analyze',
```

- [ ] **Step 5: Typecheck frontend**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx tsc --noEmit 2>&1 | grep "environments\|insights-analysis" | head -5
```

Expected: no errors in those files.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/insights/ \
        src/environments/
git commit -m "feat(models): add InsightsAnalysis model + insightsApiUrl to environments"
```

---

## Task 4: Frontend — InsightsCacheStorageService + InsightsLlmClientService

**Files:**
- Create: `src/app/core/services/insights/insights-cache-storage.service.ts`
- Create: `src/app/core/services/insights/insights-llm-client.service.ts`

- [ ] **Step 1: Create `insights-cache-storage.service.ts`**

Follows the same pattern as `HistoryEventLogService extends StorageService<PantryEvent>`.

```ts
import { Injectable } from '@angular/core';
import { StorageService } from '../shared/storage.service';
import type { InsightsAnalysisCache } from '@core/models/insights/insights-analysis.model';

@Injectable({ providedIn: 'root' })
export class InsightsCacheStorageService extends StorageService<InsightsAnalysisCache> {
  private readonly CACHE_ID = 'insights-analysis-cache';

  async loadCache(): Promise<InsightsAnalysisCache | null> {
    return this.get(this.CACHE_ID);
  }

  async saveCache(analysis: InsightsAnalysisCache['analysis']): Promise<void> {
    const now = new Date().toISOString();
    await this.save({
      _id: this.CACHE_ID,
      type: 'insights_cache',
      analysis,
      createdAt: now,
      updatedAt: now,
    } as InsightsAnalysisCache);
  }
}
```

- [ ] **Step 2: Create `insights-llm-client.service.ts`**

```ts
import { Injectable, inject } from '@angular/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import type { InsightsAnalysis, InsightsAnalysisPayload } from '@core/models/insights/insights-analysis.model';
import { environment } from 'src/environments/environment';

export type InsightsClientError = 'RATE_LIMIT' | 'TIMEOUT' | 'PRO_REQUIRED' | 'ANALYSIS_FAILED';

@Injectable({ providedIn: 'root' })
export class InsightsLlmClientService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.insightsApiUrl;
  private readonly timeoutMs = 20000;

  async analyze(payload: InsightsAnalysisPayload): Promise<InsightsAnalysis> {
    if (!this.endpoint) {
      throw this.makeError('ANALYSIS_FAILED');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const userId = this.revenuecat.getUserId();
    if (userId) headers['x-user-id'] = userId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw this.makeError('TIMEOUT');
      throw this.makeError('ANALYSIS_FAILED');
    }

    if (response.status === 403) throw this.makeError('PRO_REQUIRED');
    if (response.status === 429) throw this.makeError('RATE_LIMIT');
    if (!response.ok) throw this.makeError('ANALYSIS_FAILED');

    const body = await response.json();
    const analysis = body?.analysis;

    if (
      !analysis ||
      !Array.isArray(analysis.patterns) ||
      !Array.isArray(analysis.problems) ||
      !Array.isArray(analysis.recommendations) ||
      !Array.isArray(analysis.suggestions)
    ) {
      throw this.makeError('ANALYSIS_FAILED');
    }

    return analysis as InsightsAnalysis;
  }

  private makeError(code: InsightsClientError): Error & { code: InsightsClientError } {
    return Object.assign(new Error(code), { code });
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "insights-cache\|insights-llm" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/insights/insights-cache-storage.service.ts \
        src/app/core/services/insights/insights-llm-client.service.ts
git commit -m "feat(service): add InsightsCacheStorageService and InsightsLlmClientService"
```

---

## Task 5: Update `InsightsStateService` — PRO signals + cache + triggerProAnalysis()

**Files:**
- Modify: `src/app/core/services/insights/insights-state.service.ts`

- [ ] **Step 1: Replace file with updated version**

Read the current file first. Replace the entire file with:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryEvent } from '@core/models/events';
import type { InsightsAnalysis, InsightsAnalysisPayload } from '@core/models/insights/insights-analysis.model';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { InsightsCacheStorageService } from './insights-cache-storage.service';
import { InsightsLlmClientService } from './insights-llm-client.service';
import type { InsightsClientError } from './insights-llm-client.service';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
} from '@core/domain/insights/insights-free.domain';
import type { ActivityMetrics, DistributionMetrics, InventorySnapshot } from '@core/domain/insights/insights-free.domain';

export type { ActivityMetrics, DistributionMetrics, InventorySnapshot };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class InsightsStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly revenueCat = inject(UpgradeRevenuecatService);
  private readonly cacheStorage = inject(InsightsCacheStorageService);
  private readonly llmClient = inject(InsightsLlmClientService);

  private readonly events = signal<PantryEvent[]>([]);
  readonly isLoadingEvents = signal(true);

  // PRO analysis state
  readonly proAnalysis = signal<InsightsAnalysis | null>(null);
  readonly proAnalysisLoading = signal(false);
  readonly proAnalysisError = signal<InsightsClientError | null>(null);
  readonly proAnalysisStale = computed(() => {
    const a = this.proAnalysis();
    if (!a) return true;
    return Date.now() - new Date(a.generatedAt).getTime() > CACHE_TTL_MS;
  });

  readonly inventorySnapshot = computed((): InventorySnapshot =>
    computeInventorySnapshot(this.pantryStore.items(), new Date())
  );

  readonly activityMetrics = computed((): ActivityMetrics =>
    computeActivityMetrics(this.events(), 30, new Date())
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(), 30)
  );

  readonly isPro = computed(() => this.revenueCat.isPro());

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.isLoadingEvents.set(true);
    const loaded = await this.eventLog.listEvents();
    this.events.set(loaded);
    this.isLoadingEvents.set(false);

    if (this.isPro()) {
      const cached = await this.cacheStorage.loadCache();
      if (cached && !this.isStaleAnalysis(cached.analysis)) {
        this.proAnalysis.set(cached.analysis);
      }
    }
  }

  async triggerProAnalysis(): Promise<void> {
    this.proAnalysisLoading.set(true);
    this.proAnalysisError.set(null);

    const payload = this.buildPayload();

    try {
      const analysis = await this.llmClient.analyze(payload);
      await this.cacheStorage.saveCache(analysis);
      this.proAnalysis.set(analysis);
    } catch (err: any) {
      const code = err?.code ?? 'ANALYSIS_FAILED';
      this.proAnalysisError.set(code as InsightsClientError);
    } finally {
      this.proAnalysisLoading.set(false);
    }
  }

  private buildPayload(): InsightsAnalysisPayload {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;

    const recentEvents = this.events()
      .filter(e => new Date(e.timestamp).getTime() >= cutoff)
      .filter(e => e.eventType === 'ADD' || e.eventType === 'CONSUME' || e.eventType === 'EXPIRE')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 200)
      .map(e => ({
        eventType: e.eventType as 'ADD' | 'CONSUME' | 'EXPIRE',
        foodType: e.foodType,
        timestamp: e.timestamp,
        productName: e.productName,
      }));

    const snap = this.inventorySnapshot();
    return {
      events: recentEvents,
      snapshot: {
        total: snap.total,
        expired: snap.expired,
        review: snap.review,
        nearExpiry: snap.nearExpiry,
        basicsOutOfStock: snap.basicsOutOfStock,
      },
    };
  }

  private isStaleAnalysis(analysis: InsightsAnalysis): boolean {
    return Date.now() - new Date(analysis.generatedAt).getTime() > CACHE_TTL_MS;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "insights-state" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/insights/insights-state.service.ts
git commit -m "feat(service): extend InsightsStateService with PRO analysis signals, cache, triggerProAnalysis()"
```

---

## Task 6: Component — helper methods + section D template

**Files:**
- Modify: `src/app/features/insights/insights.component.ts`
- Modify: `src/app/features/insights/insights.component.html`

- [ ] **Step 1: Add PRO helpers to `insights.component.ts`**

Read the file. Inside the class body, add after `getFoodTypeKey()`:

```ts
  readonly proSections = [
    { key: 'patterns',        icon: 'analytics-outline',  labelKey: 'insights.pro.sections.patterns' },
    { key: 'problems',        icon: 'warning-outline',    labelKey: 'insights.pro.sections.problems' },
    { key: 'recommendations', icon: 'bulb-outline',       labelKey: 'insights.pro.sections.recommendations' },
    { key: 'suggestions',     icon: 'calendar-outline',   labelKey: 'insights.pro.sections.suggestions' },
  ] as const;

  getAnalysisSection(key: string): string[] {
    const a = this.facade.proAnalysis();
    if (!a) return [];
    return (a as Record<string, string[]>)[key] ?? [];
  }
```

Also add `RouterLink` import if not already present (it is — added in Task 3 of Sub-proyecto B).

- [ ] **Step 2: Replace section D in `insights.component.html`**

Read the file. Find the section D block (starts with `<!-- SECTION D: PRO teaser (non-PRO only) -->`). Replace the entire `@if (!facade.isPro())` block with:

```html
      <!-- SECTION D: PRO analysis / teaser -->
      @if (facade.isPro()) {
        <section class="insights-section">
          <h3 class="insights-section__title">{{ 'insights.pro.title' | translate }}</h3>

          @if (!facade.proAnalysis() && !facade.proAnalysisLoading() && !facade.proAnalysisError()) {
            <div class="pro-generate">
              <ion-icon name="sparkles-outline" class="pro-generate__icon"></ion-icon>
              <ion-button (click)="facade.triggerProAnalysis()">
                {{ 'insights.pro.generate' | translate }}
              </ion-button>
            </div>
          }

          @if (facade.proAnalysisLoading()) {
            <ion-skeleton-text animated style="width: 100%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 80%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 90%; height: 14px; margin-bottom: 8px;"></ion-skeleton-text>
            <ion-skeleton-text animated style="width: 60%; height: 14px;"></ion-skeleton-text>
          }

          @if (facade.proAnalysis() && !facade.proAnalysisLoading()) {
            <div class="pro-analysis-header">
              @if (facade.proAnalysisStale()) {
                <span class="pro-analysis-header__stale">{{ 'insights.pro.staleHint' | translate }}</span>
              }
              <button class="pro-analysis-header__refresh"
                (click)="facade.triggerProAnalysis()"
                [disabled]="facade.proAnalysisLoading()">
                <ion-icon name="refresh-outline"></ion-icon>
                {{ 'insights.pro.refresh' | translate }}
              </button>
            </div>
            @for (section of proSections; track section.key) {
              @if (getAnalysisSection(section.key).length > 0) {
                <div class="pro-section">
                  <h4 class="pro-section__title">
                    <ion-icon [name]="section.icon"></ion-icon>
                    {{ section.labelKey | translate }}
                  </h4>
                  <ul class="pro-section__list">
                    @for (item of getAnalysisSection(section.key); track item) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                </div>
              }
            }
          }

          @if (facade.proAnalysisError() && !facade.proAnalysisLoading()) {
            <div class="pro-error">
              <ion-icon name="alert-circle-outline"></ion-icon>
              <span>{{ 'insights.pro.error' | translate }}</span>
              <ion-button size="small" (click)="facade.triggerProAnalysis()">
                {{ 'insights.pro.retry' | translate }}
              </ion-button>
            </div>
          }
        </section>
      } @else {
        <section class="insights-section insights-section--pro-teaser">
          <div class="pro-teaser">
            <div class="pro-teaser__lock">
              <ion-icon name="lock-closed-outline"></ion-icon>
            </div>
            <ion-icon name="sparkles-outline" class="pro-teaser__icon"></ion-icon>
            <h3 class="pro-teaser__title">{{ 'insights.pro.title' | translate }}</h3>
            <p class="pro-teaser__description">{{ 'insights.pro.description' | translate }}</p>
            <ion-button [routerLink]="['/upgrade']" size="small" color="primary">
              {{ 'insights.pro.cta' | translate }}
            </ion-button>
          </div>
        </section>
      }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "^src/app/features/insights" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/insights/insights.component.ts \
        src/app/features/insights/insights.component.html
git commit -m "feat(template): replace PRO teaser with real AI analysis section (generate/loading/result/error states)"
```

---

## Task 7: SCSS — PRO analysis styles

**Files:**
- Modify: `src/app/features/insights/insights.component.scss`

- [ ] **Step 1: Append PRO analysis styles to the end of the SCSS file**

Read the file. Append at the end:

```scss
// PRO Analysis section
.pro-generate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;

  &__icon {
    font-size: 40px;
    color: var(--ion-color-primary);
  }
}

.pro-analysis-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  &__stale {
    font-size: 11px;
    color: color-mix(in srgb, var(--ion-text-color) 45%, transparent);
    flex: 1;
  }

  &__refresh {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--ion-color-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;

    ion-icon { font-size: 14px; }

    &:disabled { opacity: 0.4; cursor: default; }
  }
}

.pro-section {
  margin-bottom: 14px;

  &:last-child { margin-bottom: 0; }

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: color-mix(in srgb, var(--ion-text-color) 80%, transparent);

    ion-icon { font-size: 16px; color: var(--ion-color-primary); }
  }

  &__list {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;

    li {
      font-size: 13px;
      line-height: 1.4;
      color: color-mix(in srgb, var(--ion-text-color) 85%, transparent);
    }
  }
}

.pro-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ion-color-danger);

  ion-icon { font-size: 18px; flex-shrink: 0; }

  span { flex: 1; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/features/insights/insights.component.scss
git commit -m "feat(styles): add PRO analysis section styles — generate, result, error states"
```

---

## Task 8: i18n — Update insights.pro.* in 6 languages

**Files:** `src/assets/i18n/{es,en,de,fr,it,pt}.json`

The existing `insights.pro` block has `title`, `description`, `cta` (kept for non-PRO teaser). Add the new keys without removing the existing ones.

- [ ] **Step 1: Add keys to `es.json`**

Read the file. Inside `insights.pro`, add after `"cta": "Ver PRO"`:

```json
"generate": "Generar análisis",
"refresh": "Actualizar",
"staleHint": "Análisis desactualizado",
"error": "No se pudo generar el análisis",
"retry": "Reintentar",
"sections": {
  "patterns": "Patrones",
  "problems": "Problemas detectados",
  "recommendations": "Recomendaciones",
  "suggestions": "Esta semana"
}
```

- [ ] **Step 2: Add keys to `en.json`**

Inside `insights.pro`, add after `"cta": "See PRO"`:

```json
"generate": "Generate analysis",
"refresh": "Refresh",
"staleHint": "Analysis may be outdated",
"error": "Could not generate analysis",
"retry": "Retry",
"sections": {
  "patterns": "Patterns",
  "problems": "Detected issues",
  "recommendations": "Recommendations",
  "suggestions": "This week"
}
```

- [ ] **Step 3: Add keys to `de.json`**

Inside `insights.pro`, add after `"cta": "PRO ansehen"`:

```json
"generate": "Analyse generieren",
"refresh": "Aktualisieren",
"staleHint": "Analyse möglicherweise veraltet",
"error": "Analyse konnte nicht erstellt werden",
"retry": "Wiederholen",
"sections": {
  "patterns": "Muster",
  "problems": "Erkannte Probleme",
  "recommendations": "Empfehlungen",
  "suggestions": "Diese Woche"
}
```

- [ ] **Step 4: Add keys to `fr.json`**

Inside `insights.pro`, add after `"cta": "Voir PRO"`:

```json
"generate": "Générer l'analyse",
"refresh": "Actualiser",
"staleHint": "Analyse peut-être obsolète",
"error": "Impossible de générer l'analyse",
"retry": "Réessayer",
"sections": {
  "patterns": "Tendances",
  "problems": "Problèmes détectés",
  "recommendations": "Recommandations",
  "suggestions": "Cette semaine"
}
```

- [ ] **Step 5: Add keys to `it.json`**

Inside `insights.pro`, add after `"cta": "Vedi PRO"`:

```json
"generate": "Genera analisi",
"refresh": "Aggiorna",
"staleHint": "Analisi potrebbe essere obsoleta",
"error": "Impossibile generare l'analisi",
"retry": "Riprova",
"sections": {
  "patterns": "Tendenze",
  "problems": "Problemi rilevati",
  "recommendations": "Raccomandazioni",
  "suggestions": "Questa settimana"
}
```

- [ ] **Step 6: Add keys to `pt.json`**

Inside `insights.pro`, add after `"cta": "Ver PRO"`:

```json
"generate": "Gerar análise",
"refresh": "Atualizar",
"staleHint": "Análise pode estar desatualizada",
"error": "Não foi possível gerar a análise",
"retry": "Tentar novamente",
"sections": {
  "patterns": "Padrões",
  "problems": "Problemas detetados",
  "recommendations": "Recomendações",
  "suggestions": "Esta semana"
}
```

- [ ] **Step 7: Verify all JSON files valid**

```bash
for f in src/assets/i18n/*.json; do python3 -c "import json; json.load(open('$f'))" && echo "$f OK"; done
```

Expected: 6 lines ending with `OK`.

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/
git commit -m "feat(i18n): add insights PRO analysis keys — generate/refresh/error/sections (×6 langs)"
```

---

## Task 9: Full test suite + typecheck

- [ ] **Step 1: Run all frontend tests**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager && npx ng test --watch=false 2>&1 | tail -5
```

Expected: all tests PASS (≥35).

- [ ] **Step 2: Frontend typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "^src/" | grep -v "core/index.ts" | head -10
```

Expected: no output.

- [ ] **Step 3: Backend typecheck**

```bash
cd /Users/fernandodelolmomartin/Repos/pantry-manager/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors (pre-existing env errors excluded).

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -p
git commit -m "fix: address any Insights PRO type errors"
```

---

## Self-Review Checklist

- [x] `openaiService.createCompletion()` uses `response_format: json_object` and `stream: false`
- [x] `insightsController.analyze()` validates payload, handles all OpenAI error codes (429, 504, 5xx)
- [x] `validateAnalysis()` checks all 4 required keys before responding
- [x] `generatedAt` added by controller, not OpenAI
- [x] Max 200 events sent (slice in `buildPayload()`)
- [x] `InsightsCacheStorageService` follows existing `extends StorageService<T>` pattern
- [x] Cache loaded in `ionViewWillEnter()` only for PRO users
- [x] `proAnalysisStale` computed from `generatedAt` using 24h TTL constant
- [x] Error types match `InsightsClientError`: `RATE_LIMIT | TIMEOUT | PRO_REQUIRED | ANALYSIS_FAILED`
- [x] Non-PRO users still see the teaser (kept in `@else` branch)
- [x] `proSections` covers all 4 keys: patterns, problems, recommendations, suggestions
- [x] `getAnalysisSection()` safe: returns `[]` when `proAnalysis()` is null
- [x] Section D template covers all 4 states: generate, loading, result, error
- [x] All 6 i18n files updated with `sections.*` nested keys
- [x] Backend route mounted at `/insights` (not `/agent/insights`)
- [x] `/agent/process` endpoint untouched
