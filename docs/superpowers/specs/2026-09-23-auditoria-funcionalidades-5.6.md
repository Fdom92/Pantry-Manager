# Auditoría de funcionalidades — planificación 5.6

**Fecha:** 2026-09-23. **Estado del repo auditado:** `develop` en `cf93d97f` (5.5 ya mergeada a `main`, tag `v5.5`).

## Por qué este documento

5.6 se planifica sin los dos datos que se esperaban para decidir su rumbo: el embudo del ticket + estados vacíos de la 5.4 (previsto 2026-10-02) y "¿vuelve alguien?" (previsto 2026-10-23). Decisión de Fernando: en vez de esperar, usar esta ventana para (a) ir metiendo mejoras de QoL pequeñas y (b) revalidar **todo** lo que la app hace o permite hacer — pantalla por pantalla, lógica por lógica — para detectar qué ya no aporta, qué está roto o inalcanzable, y qué necesita refactor o reubicación.

Se hizo con 4 lecturas paralelas del código actual (no de memoria/documentación vieja): dashboard+tabs, despensa+frescos+ticket, lista+insights, ajustes+onboarding+upgrade+backend. Cada hallazgo cita archivo:línea. El análisis de producto anterior (`project_product_analysis.md`, abril 2026) queda obsoleto — hablaba de una tab "History" que ya no existe — y no se ha reutilizado.

**No sustituye a las revisiones de datos del 2 y 23 de octubre.** Esto es una auditoría de *lo que hay en el código*, no de *lo que usa la gente*. Cruzar ambas cuando lleguen los export.

---

## Resumen ejecutivo — lo que importa

### Código muerto confirmado (candidatos a borrar directamente)
1. **`BatchEditStateService` + `app-batch-edit-modal` completo** (`features/dashboard/components/batch-edit-modal/*`, `core/services/dashboard/batch-edit-state.service.ts`, 178+31+95 líneas) — flujo entero de edición masiva de lotes (tipo/categoría/fecha), montado en el dashboard, con **cero llamadores** de `openFlow()`, su único punto de entrada. Inalcanzable hoy.
2. **`TabsStateService.isPro`** (`core/services/tabs/tabs-state.service.ts:15`) — computed que nadie lee.
3. **`getExpirationSortWeight`** (`core/domain/pantry/pantry-status.domain.ts:214`) — sin referencias en producción; `core/utils/pantry-status.util.ts` es un stub de 3 líneas que solo comenta "esto se movió" — también muerto.
4. **`ShoppingReason.MANUAL`** (`core/models/list/list.model.ts:8`, peso en `list.domain.ts:9`) — enum y peso de urgencia definidos pero `determineSuggestionNeed()` nunca los asigna; los manuales van por un tipo `ManualItem` totalmente aparte.
5. **`/agent/process`** en el backend (`agent.routes.ts` + `agent.controller.ts` + `openai.service.ts#createStream`, 63 líneas) — endpoint de chat streaming con OpenAI, **sin ningún llamador en `src/app`** (no existe `environment.agentApiUrl`, a diferencia de `insightsApiUrl`/`receiptApiUrl` que sí se consumen). Superficie expuesta sin uso.

### Bug confirmado, ya conocido, sigue sin arreglar
**Onboarding conflacia "el plugin de notificaciones falló" con "el usuario denegó".** `NotificationPermissionService.request()` (`notification-permission.service.ts:41-47`) calcula el estado rico (`'unavailable'` vs `'denied'`) pero lo colapsa a un booleano antes de devolverlo; `OnboardingStateService.acceptNotifications()` (`onboarding-state.service.ts:151-153`) mapea cualquier `false` a `'denied'`. Contamina la decisión persistida, la re-pregunta del reconsent sheet y el payload de `ONBOARDING_COMPLETED` (`notif_granted`). Confirmado tal cual sigue hoy.

### Funcionalidad calculada pero nunca mostrada
**Las predicciones de reposición (`repositionPredictions`) se calculan en `InsightsStateService` pero la pantalla de Insights nunca las renderiza** — solo aparecen en el Dashboard (`dashboard.component.html:192-198`). El servicio que alimenta Insights construye datos que Insights no usa.

### Patrón sistémico: `new Date()` en vez de `ClockService.now()`
Ya hay una trampa documentada en CLAUDE.md y un bug ya arreglado por esto (`4de8d508`, "one app clock so statuses move to a new day on resume"). La auditoría confirma que **la capa de lectura/clasificación está arreglada, pero toda la capa de escritura/mutación no**: prácticamente cada modal de guardado (altas despensa/frescos, ediciones, lotes, ticket, básico, ajustes, onboarding, dev panel, trial CTA) estampa `updatedAt`/`createdAt`/timestamps con `new Date().toISOString()` directo, sin inyectar `ClockService`. Lista completa en la sección técnica. Dos subcategorías de riesgo distinto:
- **Timestamps de auditoría** (cuándo se guardó algo): bajo riesgo real, pero inconsistente con la convención del proyecto.
- **Parámetros por defecto `now: Date = new Date()` en funciones puras de dominio** (`pantry-status.domain.ts`, `pantry-filtering.domain.ts`, `expiry-suggestion.domain.ts`, `food-type-inference.domain.ts`, `dashboard.domain.ts:57`): si algún día un llamador nuevo omite el argumento, reintroduce exactamente el bug ya cazado en la 5.5. Latente, no activo hoy porque todos los llamadores actuales pasan `clock.now()` explícito — pero es una bomba de tiempo de diseño (el valor por defecto invita al error).

Caso más llamativo dentro del mismo patrón: `pantry-state.service.ts:558` (`toggleItemBasic`) usa `new Date()` directo **en el mismo fichero y clase** que en la línea 210 usa `ClockService` correctamente — no es falta del servicio, es una línea que se les coló.

### Catches mudos (sin variable, sin log) — el patrón que CLAUDE.md ya avisa que es sospechoso
- `core/services/pantry/pantry-batch-operations.service.ts:360` (`hapticImpact`) — cae a `navigator.vibrate` pero silencia el fallo real de `Haptics.impact`.
- `core/services/list/shopping-export.service.ts:189-191` — carga del icono para el PDF.
- `core/services/insights/insights-llm-client.service.ts:70-72` y `:78-80` — parseo de URL y warmup del health-check.
- `features/onboarding/components/seed-grid/seed-grid.component.ts:32` — haptics del onboarding.
- Backend: `insights.controller.ts:188` y `receipt.controller.ts:91` — parseo de la respuesta JSON de OpenAI; el error real de parseo se descarta, solo se loguea el `content` crudo.

Ninguno de estos parece tan grave como el de cámara/ticket (ya arreglado en la 5.4 con comentarios explícitos de por qué), pero son el mismo patrón que la propia CLAUDE.md pide vigilar.

### Huecos de analítica (afectan a la lectura de PostHog, no a la app en sí)
- `toggleItemBasic()` (favorito de despensa) — **sin ningún evento**. Marcar/desmarcar "mantener siempre en casa" es invisible en PostHog.
- `unhideAutoItem()` en la lista — hide/remove/un-basic trackean, unhide no.
- Ajustes: cambio de idioma, toggle de analítica, export/import/reset de datos, catálogos (añadir/quitar ubicación/categoría/supermercado), notificaciones granulares (todas sin tracking). Solo el cambio de tema trackea (`PREFERENCE_CHANGED`).
- "Convertir a fresco" / "convertir a despensa" y "borrar fresco" — sin evento dedicado, solo toast.
- CTA de las tarjetas de acción del dashboard (expirado/próximo a caducar/stock bajo/sin tocar) — se trackea el *dismiss*, no el *clic que actúa*.

### Hallazgos de seguridad/config del backend (a valorar, no urgentes)
- `app.ts:21-34` — el CORS calcula `allowedOrigins.includes(origin)` pero ambas ramas devuelven `callback(null, true)`: el check es cosmético, todo origen pasa. El comentario dice que es intencional ("mobile apps, la seguridad está en verificar userId"), pero tal como está escrito el `allowedOrigins` es lógica muerta — o se retira o se hace cumplir.
- `verifyPro.ts:11-16` — el bypass de PRO en desarrollo se activa con `NODE_ENV !== 'production'`, no con una flag dedicada. Cualquier despliegue de staging que no fije `NODE_ENV=production` deja sin gate real los 3 endpoints PRO.
- `payments.ts:15` — usa `console.error` en vez del `logger` compartido; única inconsistencia de logging del backend.

### Confirmado limpio (para cerrar el hilo, no para actuar)
**"Devolver a la lista" no existe en ningún sitio** — ni código muerto, ni handler comentado, ni clave i18n huérfana. `list-row-actions.domain.ts:1-9` documenta explícitamente que las filas de Comprado son de solo lectura. Coincide con lo ya sabido; confirma que no hay que "limpiar" nada ahí, solo construir el deshacer real si se decide meterlo en 5.6.

---

## Catálogo por pantalla (veredicto)

Leyenda: **Mantener** = sigue siendo válido tal cual · **Refactorizar** = válido pero con deuda que conviene pagar · **Matar** = borrar · **Mover** = reubicar en otra pantalla/flujo · **Revisar con datos** = la validez depende de lo que digan los export de octubre.

### Dashboard / HOY
| Elemento | Veredicto | Nota |
|---|---|---|
| Sugerencia protagonista (scoring 4 capas) | Mantener | Lógica más compleja de la app; funciona, bien documentada en el propio código. Naming menor: `dashboard.today.reason.expirestoday` se usa para el rango 3-5 días, no "hoy" — renombrar la clave algún día, no urgente. |
| Tarjetas de acción (expirado/próximo/stock bajo/sin tocar) | Mantener | Falta trackear el clic de CTA, no solo el dismiss. |
| Tarjeta de reposición (PRO) | Mover/Refactorizar | Se calcula para Insights y no se muestra ahí — decidir si Insights también la necesita o si el cálculo compartido sobra. |
| Tarjeta de desperdicio (teaser) | Mantener | Sin tracking de click-through, solo de vista. |
| Racha (streak) | Mantener | Claves i18n viven bajo `settings.streak.*` aunque solo se renderiza en dashboard — reubicar namespace cuando se toque. |
| Modal de edición masiva de lotes | **Matar** | Inalcanzable, ver código muerto arriba. |
| Sheet de re-consentimiento | Mantener | Bien instrumentado. |
| Coach mark "añade tu primer producto" | Mantener | — |

### Despensa (larga duración)
| Elemento | Veredicto | Nota |
|---|---|---|
| Lista/filtros/búsqueda/agrupado | Mantener | Núcleo de la app, sin hallazgos de código muerto. |
| Sheet de cantidad (+/-, agotar) | Mantener | — |
| Modal de lotes (batches) | Mantener | El único modal grande sin huecos de analítica relevantes. |
| Modal de edición | Mantener | "Convertir a fresco" sin evento dedicado — añadir si interesa medir adopción. |
| Sheet de pendientes (completar datos) | Mantener | Bien instrumentado. |
| Alta rápida (add sheet) | Mantener | — |
| Favorito "mantener siempre en casa" | Refactorizar | Falta analítica total — no se puede medir uso ni abandono de esta feature clave de la lista. |

### Frescos
| Elemento | Veredicto | Nota |
|---|---|---|
| Tarjeta con chip de 3 estados | Mantener | Único sitio del código que recibe el reloj como `@input` en vez de leerlo — es el patrón correcto, contrasta con el resto. |
| Alta rápida | Mantener | — |
| Modal de edición / convertir a despensa | Mantener | Sin evento dedicado a convertir ni a borrar. |

### Escaneo de ticket
| Elemento | Veredicto | Nota |
|---|---|---|
| Flujo foto→OCR→parseo→revisión→alta | Mantener | El flujo mejor instrumentado de toda la app (10 eventos distintos); los catches de cámara/OCR están todos nombrados y logueados, con comentarios explicando por qué (arreglo de la 5.4). |
| Parser por regla (9 cadenas + Family Cash) | Mantener | Sin código muerto ni TODOs. Si aparece una 4ª cadena con formato propio, el propio código ya avisa: reorganizar detección-de-formato → lector-por-formato. |
| Parser LLM (PRO, "smart scan") | Mantener | — |
| **Ticket en varias fotos** | Pendiente de diseñar | Confirmado aplazado de la 5.5, sigue siendo el hueco más citado en memoria de producto. Candidato fuerte para 5.6 si el embudo del 2 oct lo respalda. |

### Lista de la compra
| Elemento | Veredicto | Nota |
|---|---|---|
| Sugeridos automáticos + manuales | Mantener | `ShoppingReason.MANUAL` vestigial, matar. |
| Comprar (frescos instantáneo / despensa con sheet) | Mantener | — |
| Añadir manual | Mantener | — |
| Filas de Comprado (solo lectura) | **Revisar con datos / diseñar** | Confirmado limpio (nada que borrar), pero es la feature que falta si se decide meter deshacer-compra-real en 5.6. |
| Ocultar/mostrar, quitar de básicos | Refactorizar | `unhideAutoItem()` sin evento — inconsistente con sus hermanos (hide/remove/unbasic sí trackean). |
| Compartir (PDF/texto) | Mantener | Un catch mudo al cargar el icono del PDF. |

### Insights
| Elemento | Veredicto | Nota |
|---|---|---|
| Contador de desperdicio (gratis) + desglose (PRO) | Mantener | — |
| Snapshot de inventario | Mantener | — |
| Cobertura estimada | Mantener | — |
| Actividad/rotación 30 días | Mantener | — |
| Distribución por tipo de alimento | Mantener | — |
| Calidad de datos del inventario | Mantener | — |
| Insight IA (PRO) | Mantener | El fichero de dominio más grande de la app (346 líneas, `insights-pro-payload.domain.ts`) — candidato a mirar si algún día pesa en mantenimiento, no urgente ahora. |
| **Predicciones de reposición** | **Decidir** | Se calculan aquí y no se muestran aquí — ver hallazgo arriba. |

### Ajustes
| Elemento | Veredicto | Nota |
|---|---|---|
| Tema/idioma/notificaciones/privacidad | Mantener | Solo tema trackea cambios; el resto no. Restos de comentarios de sección vacíos (`settings.component.ts:157-181`) — limpieza cosmética trivial. |
| Backup export/import/reset | Refactorizar | Cero analítica en una operación destructiva (reset) y en restaurar backups — si algo va mal en producción, no hay forma de verlo en PostHog. |
| Catálogos (ubicaciones/categorías/supermercados) | Mantener | Bien factorizado (una tabla dirige las 3), sin analítica. |
| Notificaciones granulares | Mantener | Sin analítica de cambios. |
| Panel dev | Mantener (es dev-only) | Un par de strings en inglés sin i18n (bajo impacto, no sale en prod) y un `localStorage.removeItem` directo saltándose el servicio — aceptable por ser herramienta dev, documentado como tal en el propio código. |

### Onboarding
| Elemento | Veredicto | Nota |
|---|---|---|
| Flujo de slides + consentimiento + siembra | Mantener | Bien instrumentado, bien comentado. |
| **Conflación 'unavailable' vs 'denied'** | **Arreglar** | Bug confirmado, ver arriba. Coste de arreglo bajo: propagar el estado rico en vez de colapsarlo a booleano en `request()`. |

### Upgrade / PRO
| Elemento | Veredicto | Nota |
|---|---|---|
| Paywall / planes | Mantener | Buena cobertura de analítica y manejo de errores. |
| Motor RevenueCat | Mantener | — |
| CTAs de paywall compartidos | Mantener | `pro-trial-cta` usa `new Date()` directo. |

### Backend
| Elemento | Veredicto | Nota |
|---|---|---|
| `/insights/analyze` | Mantener | Catch mudo en el parseo de la respuesta de OpenAI — arreglar junto con el de `/receipt/parse`. |
| `/receipt/parse` | Mantener | Igual que arriba. |
| `/api/payments/check-pro` | Mantener | `console.error` en vez de logger compartido — trivial. |
| `/agent/process` | **Matar** | Sin llamador, ver código muerto arriba. |
| CORS | Refactorizar | Lógica de `allowedOrigins` cosmética, no bloquea nada — decidir si se retira o se hace cumplir de verdad. |
| `verifyPro` bypass dev | Revisar | Atado a `NODE_ENV`, no a una flag explícita — riesgo si staging no fija la variable. |

---

## Candidatos a 5.6 — backlog QoL priorizado

Todos son piezas pequeñas, cada una cabe en una tarea de `fix-bug` o `add-feature` independiente; no hace falta una rama grande para meterlas.

**Coste bajo, valor claro (empezar por aquí):**
1. Matar el modal de edición masiva de lotes (código muerto, confirmado inalcanzable).
2. Matar `TabsStateService.isPro`, `getExpirationSortWeight` + su stub, `ShoppingReason.MANUAL`, `/agent/process`.
3. Arreglar la conflación onboarding `unavailable`/`denied` (bug ya conocido, coste bajo).
4. Nombrar los 6 catches mudos (haptics, PDF, warmup, seed-grid, y los 2 del backend) — mismo patrón que CLAUDE.md ya pide vigilar.
5. Analítica para `toggleItemBasic()` — la feature de favoritos de la lista no se puede medir hoy.
6. Analítica para `unhideAutoItem()` (paridad con sus hermanos).

**Coste medio:**
7. Pasada sistemática de `new Date()` → `ClockService.now()` en la capa de escritura, empezando por los parámetros-por-defecto de funciones de dominio puras (el riesgo real, no los timestamps de auditoría). Podría acompañarse de un lint rule que lo impida a futuro.
8. Decidir qué hacer con las predicciones de reposición en Insights (mostrarlas o quitar el cálculo no usado).
9. Analítica mínima en backup/reset/import (una operación destructiva sin visibilidad).

**Depende de decisión de producto, no solo de limpieza:**
10. Deshacer compra real (filas de Comprado) — aplazado explícitamente a 5.6 desde la 5.5.
11. Ticket en varias fotos — aplazado explícitamente a 5.6 desde la 5.5, pendiente de ver el embudo del 2 oct.
12. "Cociné esto" (consumo por lotes sin foto/LLM) — sigue en el roadmap desde la 5.4, no evaluado en esta auditoría porque es una feature nueva, no una revalidación de lo existente.

---

## Qué queda fuera de esta auditoría
- No se ha cruzado nada con PostHog — es auditoría de código, no de uso real. Ninguna decisión aquí debería tratarse como definitiva hasta cruzar con el export del 2 de octubre.
- No se ha revisado `core/domain/**/*.spec.ts` en detalle (cobertura de tests), solo el código de producción.
- No se ha entrado en `android/` más allá de listar el único plugin local (`InstallSourcePlugin`).
