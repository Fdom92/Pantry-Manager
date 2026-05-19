# Sub-proyecto B — Tab Insights FREE

**Fecha:** 2026-05-14
**Rama:** feat/rework-insights
**Depende de:** Sub-proyecto A completado (planner + history eliminados)
**Contexto:** Añade nueva tab `/insights` con análisis local determinístico. Sin IA. Sub-proyecto C añadirá la capa PRO sobre esta misma tab.

---

## Objetivo

Ofrecer una capa de análisis del inventario que el Dashboard no cubre. El Dashboard = urgencia e inmediatez. Insights FREE = métricas, patrones y estado profundo.

**Sin duplicar nada del Dashboard:**
- ❌ No muestra pantryScore, foodCoverage, pantryHealth
- ❌ No muestra actions (expired → delete, near-expiry, low-stock)
- ❌ No muestra insight nudges (add expiry dates, categorize)

---

## Arquitectura

Patrón idéntico al de Dashboard: domain layer de funciones puras + state service page-scoped + feature component.

```
core/domain/insights/insights-free.domain.ts     — funciones puras
core/services/insights/insights-state.service.ts  — page-scoped (providers[])
features/insights/insights.component.ts/html/scss — tab page
```

### Flujo de datos

```
ionViewWillEnter()
  → HistoryEventLogService.listEvents()   (async, PouchDB)
  → events.set(result)                    (WritableSignal)

computed signals (automáticos):
  inventorySnapshot = computeInventorySnapshot(pantryStore.items(), now)
  activityMetrics   = computeActivityMetrics(events(), 30, now)
  distribution      = computeDistribution(pantryStore.items(), events())
  isPro             = revenueCat.isPro()
```

`events` inicializado a `[]`. Template muestra skeleton mientras carga.

---

## Modelos (en `insights-free.domain.ts`)

```ts
export interface InventorySnapshot {
  total: number;
  active: number;           // total - expired
  expired: number;
  review: number;
  nearExpiry: number;
  lowStock: number;
  basicsOutOfStock: number; // isBasic === true && sumQuantities(batches) === 0
  noExpiryDate: number;     // items without any batch expiry date
  expiredRatio: number;     // expired / total (0–1), 0 if total === 0
}

export interface ActivityMetrics {
  added: number;            // ADD events in window
  consumed: number;         // CONSUME events in window
  expired: number;          // EXPIRE events in window
  wasteRatio: number | null;// expired/(expired+consumed), null if both 0
  windowDays: number;       // always 30
}

export interface DistributionMetrics {
  topFoodTypes: { foodType: FoodType; count: number }[]; // top 3 by item count
  mostWastedFoodType: FoodType | null; // from EXPIRE events in 30d window
}
```

---

## Funciones del dominio

### `computeInventorySnapshot(items, now)`

Itera `items`. Para cada item:
- Llama `getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS)` para clasificar.
- Incrementa contadores según estado: `expired`, `review`, `near-expiry`, `low-stock`.
- `basicsOutOfStock`: `item.isBasic === true && sumQuantities(item.batches) === 0`.
- `noExpiryDate`: item sin ningún batch con `expirationDate` y sin `noExpiry: true`.
- `expiredRatio`: `expired / total`, 0 si total === 0.

### `computeActivityMetrics(events, windowDays, now)`

Filtra `events` donde `timestamp >= now - windowDays * 24h`.
Cuenta por `eventType`: `ADD` → `added`, `CONSUME` → `consumed`, `EXPIRE` → `expired`.
`wasteRatio = expired / (expired + consumed)`, `null` si `expired + consumed === 0`.

### `computeDistribution(items, events)`

**topFoodTypes:** agrupa items activos (excluye `productType === 'fresh'` y `foodType === HOUSEHOLD`) por `foodType`, ordena por count DESC, toma top 3.

**mostWastedFoodType:** filtra EXPIRE events de últimos 30d con `foodType` presente, agrupa por `foodType`, devuelve el más frecuente. `null` si sin datos.

---

## UI — 4 Secciones

### Sección A: Estado actual

Header: "Tu despensa ahora"

Grid 2×2 de metric cards:
- Activos (count)
- Caducados (count, rojo si > 0)
- En revisión (count, naranja si > 0)
- Básicos sin stock (count, naranja si > 0)

Fila adicional:
- "Sin fecha: X de Y productos" — badge muted, accionable via navigate a pantry con filtro noExpiry (futuro)

### Sección B: Actividad últimos 30 días

Header: "Últimos 30 días"

3 contadores horizontales: Añadidos · Consumidos · Caducados

Badge de tasa de desperdicio:
- `null` → "Sin actividad registrada"
- `0%` → verde "Sin desperdicio"
- `≤20%` → verde
- `21–40%` → naranja
- `>40%` → rojo

### Sección C: Distribución por tipo de alimento

Header: "Por tipo de alimento"

Top 3 foodTypes: nombre + count + barra proporcional CSS (sin libs de gráficos).
Width: `(count / max) * 100%`.

Si `mostWastedFoodType` presente → badge "Más caducados: [tipo]".

### Sección D: Análisis PRO (teaser/locked)

Solo visible a usuarios no-PRO.

Card con:
- Icono `sparkles-outline`
- Título: `insights.pro.title`
- Descripción: `insights.pro.description`
- `ion-button` → `/upgrade`
- Overlay semitransparente con icono `lock-closed-outline`

Para usuarios PRO: **sección ausente**. Sub-proyecto C la reemplaza con contenido real.

---

## Routing

`app.routes.ts` — añadir:
```ts
{
  path: 'insights',
  loadComponent: () =>
    import('@features/insights/insights.component').then(m => m.InsightsComponent),
},
```

`tabs.component.html` — orden final: **Dashboard · Despensa · Insights · Lista**

```html
<ion-tab-button tab="insights" [routerLink]="['/insights']">
  <ion-icon name="analytics-outline"></ion-icon>
  <ion-label>{{ 'insights.tabTitle' | translate }}</ion-label>
</ion-tab-button>
```

---

## i18n (×6 idiomas: es/en/de/fr/it/pt)

Nuevo bloque `"insights"` top-level en cada fichero:

| Clave | es | en | de | fr | it | pt |
|---|---|---|---|---|---|---|
| `tabTitle` | Insights | Insights | Insights | Insights | Insights | Insights |
| `title` | Análisis | Analysis | Analyse | Analyse | Analisi | Análise |
| `snapshot.title` | Tu despensa ahora | Your pantry now | Dein Vorrat jetzt | Ton garde-manger | La tua dispensa | A tua despensa |
| `snapshot.active` | Activos | Active | Aktiv | Actifs | Attivi | Ativos |
| `snapshot.expired` | Caducados | Expired | Abgelaufen | Périmés | Scaduti | Expirados |
| `snapshot.review` | Revisar | Check | Prüfen | Vérifier | Verificare | Verificar |
| `snapshot.basicsOut` | Básicos sin stock | Basics out of stock | Basis leer | Essentiels vides | Essenziali esauriti | Básicos sem stock |
| `snapshot.noExpiry` | Sin fecha ({{count}} de {{total}}) | No date ({{count}} of {{total}}) | Kein Datum ({{count}} von {{total}}) | Sans date ({{count}} sur {{total}}) | Senza data ({{count}} su {{total}}) | Sem data ({{count}} de {{total}}) |
| `activity.title` | Últimos 30 días | Last 30 days | Letzte 30 Tage | 30 derniers jours | Ultimi 30 giorni | Últimos 30 dias |
| `activity.added` | Añadidos | Added | Hinzugefügt | Ajoutés | Aggiunti | Adicionados |
| `activity.consumed` | Consumidos | Consumed | Verbraucht | Consommés | Consumati | Consumidos |
| `activity.expired` | Caducados | Expired | Abgelaufen | Périmés | Scaduti | Expirados |
| `activity.wasteRatio` | Desperdicio | Waste rate | Verschwendung | Gaspillage | Spreco | Desperdício |
| `activity.noActivity` | Sin actividad registrada | No activity recorded | Keine Aktivität | Aucune activité | Nessuna attività | Sem atividade |
| `activity.noWaste` | Sin desperdicio | No waste | Kein Verlust | Aucun gaspillage | Nessuno spreco | Sem desperdício |
| `distribution.title` | Por tipo de alimento | By food type | Nach Lebensmitteltyp | Par type d'aliment | Per tipo di cibo | Por tipo de alimento |
| `distribution.mostWasted` | Más caducados | Most expired | Meiste abgelaufen | Plus périmés | Più scaduti | Mais expirados |
| `pro.title` | Análisis inteligente con IA | Smart AI analysis | Intelligente KI-Analyse | Analyse IA intelligente | Analisi IA intelligente | Análise inteligente com IA |
| `pro.description` | Detecta patrones, predice desperdicio y te da recomendaciones personalizadas. | Detects patterns, predicts waste and gives personalised recommendations. | Erkennt Muster, prognostiziert Verluste und gibt persönliche Empfehlungen. | Détecte les tendances, prédit le gaspillage et donne des recommandations personnalisées. | Rileva schemi, prevede gli sprechi e fornisce raccomandazioni personalizzate. | Deteta padrões, prevê desperdício e dá recomendações personalizadas. |
| `pro.cta` | Ver PRO | See PRO | PRO ansehen | Voir PRO | Vedi PRO | Ver PRO |

---

## Tests

Fichero: `core/domain/insights/insights-free.domain.spec.ts`

**`computeInventorySnapshot`:**
- Item expired → `expired++`, `active` no incluye expirado
- Item review → `review++`
- Item isBasic + qty 0 → `basicsOutOfStock++`
- Item sin batch expiryDate → `noExpiryDate++`
- `expiredRatio` = 0 si total === 0

**`computeActivityMetrics`:**
- ADD event en window → `added++`
- EXPIRE event fuera de window → ignorado
- `wasteRatio` = null si expired=0 y consumed=0
- `wasteRatio` = 0 si consumed > 0 y expired = 0
- `wasteRatio` = 1 si expired > 0 y consumed = 0

**`computeDistribution`:**
- Items DAIRY dominan → `topFoodTypes[0].foodType === DAIRY`
- HOUSEHOLD excluido de top food types
- `mostWastedFoodType` null si sin EXPIRE events con foodType

---

## Invariantes

1. `HistoryEventLogService` y `HistoryEventManagerService` no se modifican
2. Dashboard no cambia (sus computed, signals, ni HTML)
3. `InsightsStateService` es page-scoped — no `providedIn: 'root'`
4. Sin librerías de gráficos externas — solo CSS bars
5. Sección PRO: ausente para usuarios PRO (Sub-proyecto C la reemplaza)
6. `computeInventorySnapshot` usa `NEAR_EXPIRY_WINDOW_DAYS` de `@core/constants`
7. Frescos (`productType === 'fresh'`) excluidos de `topFoodTypes` en distribución
