# Sub-proyecto C — Insights PRO (IA)

**Fecha:** 2026-05-14
**Rama:** feat/rework-insights
**Depende de:** Sub-proyecto B completado (tab Insights FREE activa)
**Contexto:** Reemplaza la sección D (teaser bloqueado) con análisis real de IA para usuarios PRO. El backend procesa eventos del usuario y devuelve patrones, problemas, recomendaciones y sugerencias en JSON estructurado. El resultado se cachea en PouchDB con TTL de 24h.

---

## Objetivo

El usuario PRO puede generar un análisis de comportamiento de su despensa basado en sus eventos de los últimos 30 días. La IA analiza qué compra, qué desperdicia, qué consume, y devuelve insights accionables.

---

## Arquitectura

Opción A: nuevo endpoint `/insights/analyze` (POST, JSON no-streaming). El endpoint existente `/agent/process` (SSE streaming) no se toca.

```
Frontend                        Backend
--------                        -------
InsightsLlmClientService ──────► POST /insights/analyze
  fetch + response.json()         verifyPro + agentRateLimiter
                                  insights.controller.ts
                                  ├── buildInsightsPrompt(payload)
                                  └── openaiService.createCompletion()
                                       response_format: json_object
```

---

## Backend — Ficheros nuevos/modificados

### Nuevos

**`backend/src/routes/insights.routes.ts`**
```ts
import { Router } from 'express';
import { insightsController } from '../controllers/insights.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';
import { agentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.post('/analyze', verifyPro, agentRateLimiter, insightsController.analyze);
export default router;
```

**`backend/src/controllers/insights.controller.ts`**

Responsabilidad: validar payload → construir prompt → llamar OpenAI → validar JSON respuesta → responder.

```ts
async analyze(req, res): Promise<void>
  body: { events: InsightsEventPayload[], snapshot: InsightsSnapshotPayload }
  → validate presence of events + snapshot
  → buildInsightsPrompt(events, snapshot) → { system, userMessage }
  → openaiService.createCompletion({ system, userMessage })
  → parse JSON, validate keys: patterns, problems, recommendations, suggestions
  → res.json({ analysis: { ...parsed, generatedAt: new Date().toISOString() } })
```

Error handling:
- 400 si falta payload
- 429 si OpenAI rate limit
- 504 si timeout
- 502 si OpenAI error 5xx
- 500 genérico

**Función `buildInsightsPrompt(events, snapshot)`** (en el controller o helper inline):

System prompt:
```
Eres un asistente de análisis de despensa doméstica. Analiza los datos y devuelve ÚNICAMENTE un JSON válido con este formato exacto:

{"patterns":[],"problems":[],"recommendations":[],"suggestions":[]}

Reglas: máximo 3 ítems por sección, mínimo 1. Cada ítem: frase corta y accionable. Sin texto fuera del JSON. Idioma: español.
```

User message (texto estructurado con los datos):
```
INVENTARIO ACTUAL:
- Total: {snapshot.total} productos
- Caducados: {snapshot.expired}
- En revisión: {snapshot.review}
- Próximos a caducar: {snapshot.nearExpiry}
- Básicos sin stock: {snapshot.basicsOutOfStock}

ACTIVIDAD ÚLTIMOS 30 DÍAS ({events.length} eventos):
- Añadidos: {addedCount}
- Consumidos: {consumedCount}
- Caducados sin usar: {expiredCount}
- Tipos más añadidos: {topAdded}
- Tipos más caducados: {topExpired}
```

### Modificado

**`backend/src/services/openai.service.ts`** — añadir método:

```ts
async createCompletion(payload: { system: string; userMessage: string }): Promise<string>
// client.chat.completions.create({
//   model,
//   messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
//   response_format: { type: 'json_object' },
//   stream: false,
// })
// returns choices[0].message.content
```

**`backend/src/app.ts`** — registrar route:
```ts
import insightsRoutes from './routes/insights.routes.js';
app.use('/insights', insightsRoutes);
```

---

## Frontend — Modelos

**`src/app/core/models/insights/insights-analysis.model.ts`** (nuevo):

```ts
export interface InsightsAnalysis {
  patterns: string[];
  problems: string[];
  recommendations: string[];
  suggestions: string[];
  generatedAt: string; // ISO timestamp
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
  _id: 'insights-analysis-cache';
  _rev?: string;
  type: 'insights_cache';
  analysis: InsightsAnalysis;
  createdAt: string;
  updatedAt: string;
}
```

---

## Frontend — Environments

**`src/environments/environment.model.ts`** — añadir:
```ts
insightsApiUrl: string;
```

**`src/environments/environment.ts`**:
```ts
insightsApiUrl: 'https://pantry-manager-develop.onrender.com/insights/analyze',
```

**`src/environments/environment.prod.ts`**:
```ts
insightsApiUrl: 'https://pantry-manager.onrender.com/insights/analyze',
```

---

## Frontend — `InsightsLlmClientService` (nuevo, `providedIn: 'root'`)

**`src/app/core/services/insights/insights-llm-client.service.ts`**

```ts
@Injectable({ providedIn: 'root' })
export class InsightsLlmClientService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.insightsApiUrl;
  private readonly timeoutMs = 20000;

  async analyze(payload: InsightsAnalysisPayload): Promise<InsightsAnalysis>
  // fetch POST endpoint, Header x-user-id, timeout via AbortController
  // response.ok check, response.json() → validates has patterns/problems/recommendations/suggestions
  // Throws typed errors: 'RATE_LIMIT' | 'TIMEOUT' | 'PRO_REQUIRED' | 'ANALYSIS_FAILED'
}
```

---

## Frontend — `InsightsStateService` — cambios

**Nuevas señales/estado:**

```ts
readonly proAnalysis = signal<InsightsAnalysis | null>(null);
readonly proAnalysisLoading = signal(false);
readonly proAnalysisError = signal<'RATE_LIMIT' | 'TIMEOUT' | 'ANALYSIS_FAILED' | null>(null);
readonly proAnalysisStale = computed(() => {
  const a = this.proAnalysis();
  if (!a) return true;
  return Date.now() - new Date(a.generatedAt).getTime() > 24 * 60 * 60 * 1000;
});
```

**Cache storage** — nuevo `StorageService<InsightsAnalysisCache>` inyectado en el servicio.

**`ionViewWillEnter()`** — ampliado:
```ts
// After loading pantry + events:
if (this.isPro()) {
  const cached = await this.cacheStorage.get('insights-analysis-cache');
  if (cached && !this.isStaleAnalysis(cached.analysis)) {
    this.proAnalysis.set(cached.analysis);
  }
}
```

**Nuevo método `triggerProAnalysis()`:**
```ts
async triggerProAnalysis(): Promise<void>
// 1. proAnalysisLoading = true, proAnalysisError = null
// 2. Build InsightsAnalysisPayload from events (last 30d, max 200) + inventorySnapshot
// 3. InsightsLlmClientService.analyze(payload)
// 4. Save to PouchDB: cacheStorage.save({ _id: 'insights-analysis-cache', type: 'insights_cache', analysis })
// 5. proAnalysis = result, proAnalysisLoading = false
// 6. On error: proAnalysisError = errorType, proAnalysisLoading = false
```

---

## Frontend — UI (Sección D reemplazada)

**`insights.component.html`** — la sección D `@if (!facade.isPro())` se reemplaza con:

```html
@if (facade.isPro()) {
  <section class="insights-section">

    <!-- sin análisis todavía -->
    @if (!facade.proAnalysis() && !facade.proAnalysisLoading()) {
      <div class="pro-generate">
        <ion-icon name="sparkles-outline"></ion-icon>
        <h3>{{ 'insights.pro.title' | translate }}</h3>
        <ion-button (click)="facade.triggerProAnalysis()">
          {{ 'insights.pro.generate' | translate }}
        </ion-button>
      </div>
    }

    <!-- cargando -->
    @if (facade.proAnalysisLoading()) {
      <ion-skeleton-text animated style="width: 100%; height: 16px; margin-bottom: 8px;"></ion-skeleton-text>
      <ion-skeleton-text animated style="width: 80%; height: 16px; margin-bottom: 8px;"></ion-skeleton-text>
      <ion-skeleton-text animated style="width: 90%; height: 16px; margin-bottom: 8px;"></ion-skeleton-text>
      <ion-skeleton-text animated style="width: 60%; height: 16px;"></ion-skeleton-text>
    }

    <!-- análisis disponible -->
    @if (facade.proAnalysis() && !facade.proAnalysisLoading()) {
      <div class="pro-analysis-header">
        <span class="pro-analysis-header__label">{{ 'insights.pro.title' | translate }}</span>
        <button class="pro-analysis-header__refresh" (click)="facade.triggerProAnalysis()"
          [disabled]="facade.proAnalysisLoading()">
          <ion-icon name="refresh-outline"></ion-icon>
          {{ 'insights.pro.refresh' | translate }}
        </button>
      </div>
      @if (facade.proAnalysisStale()) {
        <p class="pro-analysis-stale">{{ 'insights.pro.staleHint' | translate }}</p>
      }
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

    <!-- error -->
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
  <!-- teaser para no-PRO — igual que en Sub-proyecto B -->
  <section class="insights-section insights-section--pro-teaser">
    ...
  </section>
}
```

**`insights.component.ts`** — helpers:

```ts
readonly proSections = [
  { key: 'patterns',        icon: 'analytics-outline',    labelKey: 'insights.pro.sections.patterns' },
  { key: 'problems',        icon: 'warning-outline',      labelKey: 'insights.pro.sections.problems' },
  { key: 'recommendations', icon: 'bulb-outline',         labelKey: 'insights.pro.sections.recommendations' },
  { key: 'suggestions',     icon: 'calendar-outline',     labelKey: 'insights.pro.sections.suggestions' },
];

getAnalysisSection(key: string): string[] {
  const a = this.facade.proAnalysis();
  if (!a) return [];
  return (a as any)[key] ?? [];
}
```

---

## i18n — Claves nuevas en `insights.pro.*` (×6 idiomas)

Reemplazar las claves existentes del teaser con las nuevas. Claves nuevas:

| Clave | es | en |
|---|---|---|
| `pro.generate` | Generar análisis | Generate analysis |
| `pro.generating` | Analizando... | Analysing... |
| `pro.refresh` | Actualizar | Refresh |
| `pro.staleHint` | Análisis desactualizado | Analysis may be outdated |
| `pro.error` | No se pudo generar el análisis | Could not generate analysis |
| `pro.retry` | Reintentar | Retry |
| `pro.sections.patterns` | Patrones | Patterns |
| `pro.sections.problems` | Problemas detectados | Detected issues |
| `pro.sections.recommendations` | Recomendaciones | Recommendations |
| `pro.sections.suggestions` | Esta semana | This week |

*(de/fr/it/pt: traducciones análogas, incluidas en el spec completo)*

---

## Invariantes

1. El endpoint `/agent/process` no se toca
2. `InsightsStateService` sigue siendo page-scoped
3. El análisis PRO se muestra SOLO si `facade.isPro()` es `true`
4. El teaser bloqueado se mantiene para usuarios no-PRO
5. Cache `_id: 'insights-analysis-cache'` — documento único sobreescrito
6. Payload máximo 200 eventos (ordenados por timestamp DESC, slice primeros 200)
7. El frontend no envía el inventario crudo — solo el snapshot agregado
8. Prompt en español (hardcodeado v4.0)
