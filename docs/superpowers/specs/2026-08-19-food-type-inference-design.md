# Inferencia de `foodType` por nombre de producto

Branch: `feat/food-type-inference-5.2` (desde `release/5.2`)

## Contexto

El export de PostHog de 90 días (4 jun – 17 ago 2026, 40 usuarios en `environment=prod`)
identifica el problema central del producto: **se han añadido 481 productos y consumido 11**
(ratio 2,3%). Solo 7 de 40 usuarios han reducido stock alguna vez.

La cadena causal, verificada en código:

```
alta sin foodType/fecha → item sin caducidad → nearExpiryItems vacío
  → computeTodaySuggestion() devuelve null → el dashboard muestra "Todo bajo control"
  → el CTA "Usar hoy" de un toque (que YA EXISTE) nunca aparece
  → nadie consume → sin datos de rotación
  → waste tracker, insights, predicción de reposición y racha sin alimentar
```

`DashboardStateService.todaySuggestion` (`dashboard-state.service.ts:127`) llama a `computeTodaySuggestion(this.nearExpiryItems(), …)`,
que exige fechas de caducidad. Sin fecha, el producto es invisible para todo el sistema de alertas
y para el único bucle diario que la app ofrece.

El eslabón que falta es **poner fechas en el momento del alta**. Las piezas caras ya están
mergeadas en 5.2:

- `suggestExpiryDate(foodType, fromDate)` + `EXPIRY_SUGGESTION_DAYS` — `expiry-suggestion.domain.ts`
- Sheet de pendientes para el backlog — `pantry-pendientes-sheet-state.service.ts`
- Bloque HOY con CTA de consumo de un toque — `dashboard.component.html`

Falta únicamente inferir `foodType` a partir del nombre. **No existe ninguna inferencia
nombre → tipo en el código** (verificado: `grep -rln "inferFoodType|guessFoodType|foodTypeFromName"`
no devuelve resultados).

## Objetivo

Que un producto añadido con solo nombre y cantidad nazca con `foodType` y fecha de caducidad
estimada, en las cuatro vías por las que entra un producto a la despensa.

Métrica de éxito: **ratio consumido/añadido del 2,3% a >25%** en los 2 meses siguientes al release.
La fecha es el medio; el fin es que el bloque HOY tenga qué sugerir y el bucle se cierre.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Idiomas | Los 6 (es, en, de, fr, it, pt) | Cobertura completa desde el día uno. es 57% + en 38% = 95% del uso real medido; de/fr con 0 usuarios hoy. |
| Alcance de la inferencia | Solo `foodType` → y de ahí la fecha | Mínimo riesgo. `productType` sigue siendo siempre `'pantry'` en el alta, como hoy: no cambia a qué sección va el producto ni qué UX recibe. |
| Presentación | Chip visible y editable, pre-rellenado | El usuario ve lo que la app dedujo y puede corregirlo en el momento. Sin estado "estimado" nuevo en el modelo. |
| Término desconocido | Sin fecha, comportamiento actual | Garantiza que la feature no puede regresionar nada: en el peor caso queda como hoy y entra en pendientes. |
| Estructura del diccionario | Fuente por concepto, índice plano en runtime | Fuente legible, búsqueda sin locale (aguanta code-switching). |

### Descartado explícitamente

- **Inferir `productType` (fresco vs despensa).** Cambiaría la sección donde aparece el producto
  y la UX que recibe. El alta rápida hoy siempre crea despensa; alterarlo sorprende al usuario.
- **Inferir `categoryId`.** Es texto libre del usuario; meter valores nuestros choca con su taxonomía.
- **Fecha genérica para desconocidos.** Asignar 120 días a pescado fresco genera alertas falsas
  y erosiona la confianza en el canal con 87% de permisos concedidos.
- **Refinado con IA / gating PRO.** Falla el filtro north-star del propio roadmap ("¿puede ChatGPT
  hacerlo con un prompt de una línea? → rechazar"), degrada el bucle gratuito que es justo el que
  hay que arreglar, añade latencia a un flujo que debe ser instantáneo y rompe offline-first.
  El ángulo PRO correcto — **caducidad calibrada al historial del usuario** — se difiere a 5.3
  y *necesita* que esta inferencia gratuita exista antes para generar los datos.

## Diseño

### 1. Capa domain — `core/domain/pantry/food-type-inference.domain.ts` (nuevo)

Funciones puras, cero dependencias de Angular, siguiendo la convención de `core/domain/`.

```ts
export interface FoodConcept {
  key: string;                              // identificador estable, p.ej. 'milk'
  foodType: FoodType;
  terms: Record<SupportedLanguage, readonly string[]>;
}

export const FOOD_CONCEPTS: readonly FoodConcept[];

export function inferFoodType(name: string): FoodType | null;
```

`SupportedLanguage` es el tipo ya existente en `core/constants/shared/i18n.constants.ts:1`
(`'en' | 'es' | 'fr' | 'de' | 'pt' | 'it'`). Usar `Record` completo y no `Partial` fuerza en
tiempo de compilación que ningún concepto se quede sin traducir en alguno de los 6 idiomas.

**Índice en runtime.** Al cargar el módulo, `FOOD_CONCEPTS` se aplana una sola vez a un
`Map<string, FoodType>` con los términos de los 6 idiomas mezclados. La búsqueda no recibe locale:
un usuario con la app en español que teclea `"yogurt"` acierta igual.

**Algoritmo de `inferFoodType`:**

1. Normalizar con `normalizeSearchQuery()` (`normalization.util.ts:39`) — minúsculas, sin
   diacríticos, espacios colapsados. Es la misma primitiva que usa el matcher de tickets.
2. Tokenizar por espacios.
3. Escanear n-gramas contiguos **de mayor a menor longitud** (primero el nombre completo, luego
   trigramas, bigramas, y por último tokens sueltos).
4. Primer n-grama presente en el índice gana.
5. Sin match → `null`.

El orden por longitud resuelve los dos casos que importan:

- `"tomate frito"` → el bigrama matchea el concepto `fried-tomato` (despensa) antes que el token
  `"tomate"` (verdura fresca).
- El match es por **token completo**, nunca substring: `"panceta"` no matchea `"pan"`.

**Colisiones entre idiomas.** Revisadas sobre vocabulario de supermercado: caen casi siempre en
el mismo `foodType` o en uno compatible — `burro` (mantequilla it / animal es), `prune` (ciruela fr /
ciruela pasa en), `pie` (tarta en / parte del cuerpo es, que no es producto). Cuando un término
aparece en dos conceptos con distinto `foodType`, **gana el primero declarado en `FOOD_CONCEPTS`**;
el orden de declaración es por tanto significativo y queda documentado en el propio fichero.

### 2. Composición — la fecha no es lógica nueva

```
inferFoodType(name)  →  suggestExpiryDate(foodType)
   (nuevo)                  (ya existe en 5.2)
```

Un helper fino evita repetir el encadenado en los cuatro puntos de enganche:

```ts
export function inferExpiryForName(name: string, fromDate?: Date): {
  foodType: FoodType | null;
  expirationDate: string | undefined;
};
```

### 3. Puntos de enganche

| # | Punto | Cambio |
|---|---|---|
| 1 | `buildAddItemPayload()` — `pantry-builder.domain.ts` | Infiere `foodType` y asigna `expirationDate` al lote inicial cuando el llamante no pasa fecha explícita. **Cubre alta rápida y compra manual de lista**, que comparten esta función (`list-state.service.ts:167`). |
| 2 | `markAsBought()` — `list-state.service.ts:96` | El camino "automático" hoy llama a `addNewLot(id, { quantity })` **sin fecha**, creando lotes invisibles en los productos de mayor rotación. Pasa a derivar la fecha del `foodType` del item padre, o inferirla de su nombre si el padre no lo tiene. |
| 3 | Import de ticket escaneado | Aplica `inferExpiryForName()` por línea antes del bulk-add, de modo que los productos importados también nacen con fecha. |
| 4 | Sheet de pendientes — `pantry-pendientes-sheet-state.service.ts` | En `buildRow()`, cuando el item no tiene `foodType`, pre-selecciona el chip sugerido por la inferencia. Ataca el backlog ya acumulado, no solo las altas nuevas. El usuario confirma o corrige. |

Los enganches 1 y 4 se benefician de que la fila ya quede "resuelta" (`isPendienteRowResolved`),
por lo que el botón "Guardar todo" se habilita solo — comportamiento ya implementado en 5.2.

### 4. UI

Única modificación visible: en la fila del alta rápida, el chip de fecha pasa de mostrar
"Añadir fecha" a mostrar la fecha estimada cuando la inferencia acierta. Sigue siendo pulsable
para editarla con el `ExpiryPickerComponent` existente. **Sin campo nuevo en el modelo, sin
estado "estimado", sin cambios en la lista ni en la ficha del producto.**

### 5. Contenido del diccionario

~200 conceptos cubriendo la compra habitual: lácteos, proteínas, carbohidratos básicos, verdura
y fruta frecuentes, despensa seca, congelados comunes y productos de hogar.

Cada concepto lleva de 1 a 3 términos por idioma (singular y variantes ortográficas habituales;
el plural no se declara porque el escaneo por tokens ya cubre el caso frecuente en español —
ver riesgos). Se genera el diccionario base completo y **la revisión humana se concentra en
`es` y `en`**, que son el 95% del uso medido.

### 6. Tests

**Capa domain (TDD, Jasmine sin TestBed — convención de `core/domain/`):**

- normalización: mayúsculas, tildes, espacios múltiples
- n-gramas: `"tomate frito"` gana a `"tomate"`
- word-boundary: `"panceta"` no matchea `"pan"`
- code-switching: `"yogurt"` acierta con la app en español
- colisión declarada: gana el primer concepto de la lista
- desconocido → `null`
- `inferExpiryForName` compone correctamente con `suggestExpiryDate`
- cada término del diccionario mapea a un `FoodType` válido (test de integridad sobre los datos)

**Integración (nuevo para este repo):** un test que ejercite el alta real y verifique que el item
resultante nace con `foodType` y `expirationDate`. Es exactamente la red que faltó en la sesión
anterior, donde tres bugs reales pasaron 436 tests unitarios y tres rondas de revisión.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Fecha inferida notablemente equivocada para algún producto | El chip es visible y editable en el momento del alta. Y una fecha aproximada sigue siendo mejor que ninguna: sin fecha el producto es invisible para todo el sistema de alertas. |
| Plurales y variantes no cubiertos (`"tomates"`, `"huevos"`) | El escaneo por tokens acierta cuando el nombre incluye el singular. Para los plurales frecuentes en es/en se declaran ambas formas en el diccionario. Un fallo aquí degrada a "sin fecha", nunca a fecha errónea. |
| El diccionario crece sin control | Alcance cerrado en ~200 conceptos para 5.2. La ampliación se decide después con datos de uso reales (qué nombres quedaron sin match). |
| Colisiones entre idiomas no previstas | Test de integridad sobre los datos + orden de declaración documentado como desempate. |

## Fuera de alcance

- Inferencia de `productType`, `categoryId` o cantidad.
- Cualquier llamada a red, LLM o gating PRO.
- Caducidad personalizada según historial del usuario (candidata a cabecera de 5.3).
- Telemetría de aciertos/fallos de la inferencia (se puede añadir después si hace falta afinar).
