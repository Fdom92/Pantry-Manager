# foodType Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un producto añadido con solo nombre y cantidad nazca con `foodType` y fecha de caducidad estimada, en las cuatro vías por las que entra un producto a la despensa.

**Architecture:** Una función pura `inferFoodType(name)` en la capa domain, respaldada por un diccionario declarado **por concepto** con traducciones a los 6 idiomas soportados, que se aplana en un índice `Map<string, FoodType>` al cargar el módulo. Un helper `inferExpiryForName()` compone esa función con `suggestExpiryDate()` (ya existente en 5.2). Los puntos de enganche son mínimos porque `buildAddItemPayload()` es compartido por tres de los cuatro flujos de alta.

**Tech Stack:** Angular 20 + Ionic 8, capa domain de funciones puras sin dependencias de Angular, tests Jasmine sin TestBed (convención de `core/domain/`).

Spec: [`docs/superpowers/specs/2026-08-19-food-type-inference-design.md`](../specs/2026-08-19-food-type-inference-design.md)

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `core/domain/pantry/food-concepts.data.ts` (nuevo) | **Solo datos.** El array `FOOD_CONCEPTS` con conceptos y sus traducciones. Sin lógica. |
| `core/domain/pantry/food-type-inference.domain.ts` (nuevo) | **Solo lógica.** Construcción del índice, normalización, escaneo de n-gramas, `inferFoodType`, `inferExpiryForName`. |
| `core/domain/pantry/food-type-inference.domain.spec.ts` (nuevo) | Tests de la lógica + test de integridad sobre los datos. |
| `core/domain/pantry/pantry-builder.domain.ts` (modificar) | Aplica la inferencia cuando el llamante no pasa fecha. Cubre 3 flujos de alta. |
| `core/services/list/list-state.service.ts` (modificar) | Pasa fecha inferida en el camino `addNewLot` de la lista. |
| `core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts` (modificar) | Pasa fecha inferida en el camino `addNewLot` del ticket. |
| `core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts` (modificar) | Pre-selecciona el chip de `foodType` sugerido. |

**Separar datos y lógica es deliberado:** el diccionario crecerá con el tiempo y no debe obligar a releer la lógica; y la lógica se puede testear con un diccionario pequeño sin acoplarse al contenido real.

---

### Task 1: Lógica de inferencia con diccionario mínimo

**Files:**
- Create: `src/app/core/domain/pantry/food-concepts.data.ts`
- Create: `src/app/core/domain/pantry/food-type-inference.domain.ts`
- Test: `src/app/core/domain/pantry/food-type-inference.domain.spec.ts`

Esta tarea construye el motor con **solo 6 conceptos** para poder testear la lógica de forma aislada. El diccionario completo llega en las tareas 2-5.

- [ ] **Step 1: Write the failing test**

Crear `src/app/core/domain/pantry/food-type-inference.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { inferFoodType } from './food-type-inference.domain';

describe('inferFoodType', () => {
  it('matches a simple single-word term', () => {
    expect(inferFoodType('leche')).toBe(FoodType.DAIRY);
  });

  it('is case-insensitive and diacritic-insensitive', () => {
    expect(inferFoodType('LECHE')).toBe(FoodType.DAIRY);
    expect(inferFoodType('Limón')).toBe(FoodType.FRUIT);
    expect(inferFoodType('limon')).toBe(FoodType.FRUIT);
  });

  it('finds the term inside a longer product name', () => {
    expect(inferFoodType('leche entera desnatada')).toBe(FoodType.DAIRY);
  });

  it('prefers the longest n-gram: "tomate frito" beats "tomate"', () => {
    expect(inferFoodType('tomate')).toBe(FoodType.VEGETABLE);
    expect(inferFoodType('tomate frito')).toBe(FoodType.CARB);
    expect(inferFoodType('bote de tomate frito')).toBe(FoodType.CARB);
  });

  it('matches whole tokens only, never substrings', () => {
    // "panceta" contains "pan" (bread) but is pork
    expect(inferFoodType('panceta')).toBeNull();
  });

  it('handles code-switching: english term with spanish app', () => {
    expect(inferFoodType('milk')).toBe(FoodType.DAIRY);
    expect(inferFoodType('yogurt')).toBe(FoodType.DAIRY);
  });

  it('returns null for unknown terms', () => {
    expect(inferFoodType('xyzzy')).toBeNull();
    expect(inferFoodType('')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(inferFoodType(null as unknown as string)).toBeNull();
    expect(inferFoodType(undefined as unknown as string)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — módulo `./food-type-inference.domain` no encontrado.

- [ ] **Step 3: Create the minimal data file**

Crear `src/app/core/domain/pantry/food-concepts.data.ts`:

```ts
import type { SupportedLanguage } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';

/**
 * A grocery concept and the words users type for it, per language.
 *
 * ORDER IS SIGNIFICANT: when the same term appears in two concepts (which does
 * happen across languages — e.g. "burro" is butter in Italian and a donkey in
 * Spanish), the concept declared FIRST wins. Keep the more likely grocery
 * meaning earlier in the list.
 *
 * Terms must be lowercase and unaccented — they are matched against names
 * normalised with normalizeSearchQuery(). Multi-word terms are supported and
 * take precedence over single words (see inferFoodType).
 */
export interface FoodConcept {
  /** Stable identifier, English, kebab-case. Not shown to users. */
  readonly key: string;
  readonly foodType: FoodType;
  readonly terms: Record<SupportedLanguage, readonly string[]>;
}

export const FOOD_CONCEPTS: readonly FoodConcept[] = [
  // Multi-word concepts first so they are easy to spot; the n-gram scan orders
  // by length at runtime regardless of declaration order.
  {
    key: 'fried-tomato',
    foodType: FoodType.CARB,
    terms: {
      es: ['tomate frito', 'tomate triturado'],
      en: ['tomato sauce', 'canned tomato'],
      de: ['tomatensauce', 'passata'],
      fr: ['sauce tomate', 'tomate concassee'],
      it: ['passata', 'pomodoro pelati'],
      pt: ['tomate frito', 'polpa de tomate'],
    },
  },
  {
    key: 'milk',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['leche'],
      en: ['milk'],
      de: ['milch'],
      fr: ['lait'],
      it: ['latte'],
      pt: ['leite'],
    },
  },
  {
    key: 'yogurt',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['yogur', 'yogurt'],
      en: ['yogurt', 'yoghurt'],
      de: ['joghurt'],
      fr: ['yaourt'],
      it: ['yogurt'],
      pt: ['iogurte'],
    },
  },
  {
    key: 'tomato',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['tomate', 'tomates'],
      en: ['tomato', 'tomatoes'],
      de: ['tomate', 'tomaten'],
      fr: ['tomate', 'tomates'],
      it: ['pomodoro', 'pomodori'],
      pt: ['tomate', 'tomates'],
    },
  },
  {
    key: 'lemon',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['limon', 'limones'],
      en: ['lemon', 'lemons'],
      de: ['zitrone', 'zitronen'],
      fr: ['citron', 'citrons'],
      it: ['limone', 'limoni'],
      pt: ['limao', 'limoes'],
    },
  },
  {
    key: 'bread',
    foodType: FoodType.CARB,
    terms: {
      es: ['pan'],
      en: ['bread'],
      de: ['brot'],
      fr: ['pain'],
      it: ['pane'],
      pt: ['pao'],
    },
  },
];
```

- [ ] **Step 4: Create the inference logic**

Crear `src/app/core/domain/pantry/food-type-inference.domain.ts`:

```ts
import type { FoodType } from '@core/models/shared/enums.model';
import { normalizeSearchQuery } from '@core/utils/normalization.util';
import { FOOD_CONCEPTS } from './food-concepts.data';

/**
 * Flattened lookup: normalised term -> FoodType, pooled across all languages so
 * a user typing an English word in a Spanish app still matches. Built once at
 * module load. First declaration wins on collision (see FOOD_CONCEPTS docs).
 */
const TERM_INDEX: ReadonlyMap<string, FoodType> = (() => {
  const index = new Map<string, FoodType>();
  for (const concept of FOOD_CONCEPTS) {
    for (const terms of Object.values(concept.terms)) {
      for (const term of terms) {
        const key = normalizeSearchQuery(term);
        if (key && !index.has(key)) index.set(key, concept.foodType);
      }
    }
  }
  return index;
})();

/** Longest term in the index, in words. Bounds the n-gram scan. */
const MAX_TERM_WORDS: number = (() => {
  let max = 1;
  for (const term of TERM_INDEX.keys()) {
    const words = term.split(' ').length;
    if (words > max) max = words;
  }
  return max;
})();

/**
 * Guesses the FoodType of a product from the name the user typed.
 *
 * Scans contiguous word n-grams from longest to shortest so that a specific
 * multi-word product beats a generic single word ("tomate frito" is pantry
 * sauce, "tomate" is a fresh vegetable). Matching is whole-token only, so
 * "panceta" never matches "pan".
 *
 * Returns null when nothing matches — callers must treat that as "unknown"
 * and fall back to their existing no-date behaviour.
 */
export function inferFoodType(name: string): FoodType | null {
  const normalized = normalizeSearchQuery(name);
  if (!normalized) return null;

  const words = normalized.split(' ').filter(Boolean);
  if (!words.length) return null;

  const maxSize = Math.min(MAX_TERM_WORDS, words.length);
  for (let size = maxSize; size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      const candidate = words.slice(start, start + size).join(' ');
      const match = TERM_INDEX.get(candidate);
      if (match) return match;
    }
  }
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 8/8.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/domain/pantry/food-concepts.data.ts src/app/core/domain/pantry/food-type-inference.domain.ts src/app/core/domain/pantry/food-type-inference.domain.spec.ts
git commit -m "feat(pantry): add foodType inference engine with seed dictionary"
```

---

### Task 2: Diccionario — lácteos y proteínas

**Files:**
- Modify: `src/app/core/domain/pantry/food-concepts.data.ts`

Añadir conceptos al array `FOOD_CONCEPTS`, **después** de los ya existentes (`milk` y `yogurt` ya están de la Task 1 — no duplicarlos).

- [ ] **Step 1: Add the dairy and protein concepts**

Insertar estos objetos en el array, antes del cierre `];`:

```ts
  {
    key: 'cheese',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['queso'], en: ['cheese'], de: ['kase'],
      fr: ['fromage'], it: ['formaggio'], pt: ['queijo'],
    },
  },
  {
    key: 'butter',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['mantequilla'], en: ['butter'], de: ['butter'],
      fr: ['beurre'], it: ['burro'], pt: ['manteiga'],
    },
  },
  {
    key: 'cream',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['nata', 'crema'], en: ['cream'], de: ['sahne'],
      fr: ['creme'], it: ['panna'], pt: ['natas'],
    },
  },
  {
    key: 'fresh-cheese',
    foodType: FoodType.DAIRY,
    terms: {
      es: ['requeson', 'queso fresco'], en: ['cottage cheese', 'cream cheese'],
      de: ['quark', 'frischkase'], fr: ['fromage blanc'],
      it: ['ricotta'], pt: ['requeijao'],
    },
  },
  {
    key: 'eggs',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['huevo', 'huevos'], en: ['egg', 'eggs'], de: ['ei', 'eier'],
      fr: ['oeuf', 'oeufs'], it: ['uovo', 'uova'], pt: ['ovo', 'ovos'],
    },
  },
  {
    key: 'chicken',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['pollo'], en: ['chicken'], de: ['hahnchen', 'huhn'],
      fr: ['poulet'], it: ['pollo'], pt: ['frango'],
    },
  },
  {
    key: 'beef',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['ternera', 'vacuno'], en: ['beef'], de: ['rindfleisch'],
      fr: ['boeuf'], it: ['manzo'], pt: ['carne de vaca'],
    },
  },
  {
    key: 'pork',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['cerdo', 'panceta'], en: ['pork', 'bacon'], de: ['schweinefleisch', 'speck'],
      fr: ['porc', 'lardons'], it: ['maiale', 'pancetta'], pt: ['porco', 'bacon'],
    },
  },
  {
    key: 'fish',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['pescado', 'merluza', 'salmon'], en: ['fish', 'salmon', 'cod'],
      de: ['fisch', 'lachs'], fr: ['poisson', 'saumon'],
      it: ['pesce', 'salmone'], pt: ['peixe', 'salmao'],
    },
  },
  {
    key: 'tuna',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['atun'], en: ['tuna'], de: ['thunfisch'],
      fr: ['thon'], it: ['tonno'], pt: ['atum'],
    },
  },
  {
    key: 'ham',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['jamon'], en: ['ham'], de: ['schinken'],
      fr: ['jambon'], it: ['prosciutto'], pt: ['presunto'],
    },
  },
  {
    key: 'sausage',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['chorizo', 'salchicha', 'salchichon'], en: ['sausage'],
      de: ['wurst', 'wurstchen'], fr: ['saucisse', 'saucisson'],
      it: ['salsiccia', 'salame'], pt: ['linguica', 'salsicha'],
    },
  },
  {
    key: 'turkey',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['pavo'], en: ['turkey'], de: ['pute', 'truthahn'],
      fr: ['dinde'], it: ['tacchino'], pt: ['peru'],
    },
  },
  {
    key: 'tofu',
    foodType: FoodType.PROTEIN,
    terms: {
      es: ['tofu'], en: ['tofu'], de: ['tofu'],
      fr: ['tofu'], it: ['tofu'], pt: ['tofu'],
    },
  },
```

- [ ] **Step 2: Verify nothing broke**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 8/8 siguen verdes. Nótese que `panceta` ahora sí matchea (`pork`), lo cual **rompe el test de word-boundary** que usaba `panceta` como ejemplo de no-match.

- [ ] **Step 3: Fix the word-boundary test to use a term that stays unknown**

En `food-type-inference.domain.spec.ts`, sustituir el test `'matches whole tokens only, never substrings'` por:

```ts
  it('matches whole tokens only, never substrings', () => {
    // "pancarta" contains "pan" (bread) as a substring but is not a grocery
    expect(inferFoodType('pancarta')).toBeNull();
    // "limonada" contains "limon" but is a different product
    expect(inferFoodType('limonada')).toBeNull();
  });
```

- [ ] **Step 4: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry/food-concepts.data.ts src/app/core/domain/pantry/food-type-inference.domain.spec.ts
git commit -m "feat(pantry): add dairy and protein concepts to food dictionary"
```

---

### Task 3: Diccionario — carbohidratos y despensa seca

**Files:**
- Modify: `src/app/core/domain/pantry/food-concepts.data.ts`

- [ ] **Step 1: Add the carb and dry-pantry concepts**

Insertar en el array, antes del cierre `];` (`bread` y `fried-tomato` ya existen de la Task 1):

```ts
  {
    key: 'pasta',
    foodType: FoodType.CARB,
    terms: {
      es: ['pasta', 'macarrones', 'espaguetis'], en: ['pasta', 'spaghetti', 'macaroni'],
      de: ['nudeln', 'spaghetti'], fr: ['pates', 'spaghetti'],
      it: ['pasta', 'spaghetti'], pt: ['massa', 'esparguete'],
    },
  },
  {
    key: 'rice',
    foodType: FoodType.CARB,
    terms: {
      es: ['arroz'], en: ['rice'], de: ['reis'],
      fr: ['riz'], it: ['riso'], pt: ['arroz'],
    },
  },
  {
    key: 'flour',
    foodType: FoodType.CARB,
    terms: {
      es: ['harina'], en: ['flour'], de: ['mehl'],
      fr: ['farine'], it: ['farina'], pt: ['farinha'],
    },
  },
  {
    key: 'chickpeas',
    foodType: FoodType.CARB,
    terms: {
      es: ['garbanzos'], en: ['chickpeas'], de: ['kichererbsen'],
      fr: ['pois chiches'], it: ['ceci'], pt: ['grao de bico'],
    },
  },
  {
    key: 'lentils',
    foodType: FoodType.CARB,
    terms: {
      es: ['lentejas'], en: ['lentils'], de: ['linsen'],
      fr: ['lentilles'], it: ['lenticchie'], pt: ['lentilhas'],
    },
  },
  {
    key: 'beans',
    foodType: FoodType.CARB,
    terms: {
      es: ['alubias', 'judias', 'frijoles'], en: ['beans'],
      de: ['bohnen'], fr: ['haricots'], it: ['fagioli'], pt: ['feijao'],
    },
  },
  {
    key: 'cereal',
    foodType: FoodType.CARB,
    terms: {
      es: ['cereales', 'avena'], en: ['cereal', 'oats'],
      de: ['muesli', 'haferflocken'], fr: ['cereales', 'avoine'],
      it: ['cereali', 'avena'], pt: ['cereais', 'aveia'],
    },
  },
  {
    key: 'sugar',
    foodType: FoodType.CARB,
    terms: {
      es: ['azucar'], en: ['sugar'], de: ['zucker'],
      fr: ['sucre'], it: ['zucchero'], pt: ['acucar'],
    },
  },
  {
    key: 'cookies',
    foodType: FoodType.CARB,
    terms: {
      es: ['galletas'], en: ['cookies', 'biscuits'], de: ['kekse'],
      fr: ['biscuits'], it: ['biscotti'], pt: ['bolachas'],
    },
  },
  {
    key: 'olive-oil',
    foodType: FoodType.OTHER,
    terms: {
      es: ['aceite', 'aceite de oliva'], en: ['oil', 'olive oil'],
      de: ['ol', 'olivenol'], fr: ['huile', 'huile olive'],
      it: ['olio', 'olio oliva'], pt: ['azeite', 'oleo'],
    },
  },
  {
    key: 'salt',
    foodType: FoodType.OTHER,
    terms: {
      es: ['sal'], en: ['salt'], de: ['salz'],
      fr: ['sel'], it: ['sale'], pt: ['sal'],
    },
  },
  {
    key: 'vinegar',
    foodType: FoodType.OTHER,
    terms: {
      es: ['vinagre'], en: ['vinegar'], de: ['essig'],
      fr: ['vinaigre'], it: ['aceto'], pt: ['vinagre'],
    },
  },
  {
    key: 'coffee',
    foodType: FoodType.OTHER,
    terms: {
      es: ['cafe'], en: ['coffee'], de: ['kaffee'],
      fr: ['cafe'], it: ['caffe'], pt: ['cafe'],
    },
  },
  {
    key: 'tea',
    foodType: FoodType.OTHER,
    terms: {
      es: ['te', 'infusion'], en: ['tea'], de: ['tee'],
      fr: ['the', 'infusion'], it: ['te', 'tisana'], pt: ['cha'],
    },
  },
```

- [ ] **Step 2: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 8/8.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/domain/pantry/food-concepts.data.ts
git commit -m "feat(pantry): add carb and dry-pantry concepts to food dictionary"
```

---

### Task 4: Diccionario — verduras y frutas

**Files:**
- Modify: `src/app/core/domain/pantry/food-concepts.data.ts`

- [ ] **Step 1: Add the vegetable and fruit concepts**

Insertar en el array, antes del cierre `];` (`tomato` y `lemon` ya existen de la Task 1):

```ts
  {
    key: 'onion',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['cebolla', 'cebollas'], en: ['onion', 'onions'],
      de: ['zwiebel', 'zwiebeln'], fr: ['oignon', 'oignons'],
      it: ['cipolla', 'cipolle'], pt: ['cebola', 'cebolas'],
    },
  },
  {
    key: 'potato',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['patata', 'patatas'], en: ['potato', 'potatoes'],
      de: ['kartoffel', 'kartoffeln'], fr: ['pomme de terre'],
      it: ['patata', 'patate'], pt: ['batata', 'batatas'],
    },
  },
  {
    key: 'garlic',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['ajo', 'ajos'], en: ['garlic'], de: ['knoblauch'],
      fr: ['ail'], it: ['aglio'], pt: ['alho'],
    },
  },
  {
    key: 'lettuce',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['lechuga'], en: ['lettuce'], de: ['salat'],
      fr: ['laitue'], it: ['lattuga'], pt: ['alface'],
    },
  },
  {
    key: 'carrot',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['zanahoria', 'zanahorias'], en: ['carrot', 'carrots'],
      de: ['karotte', 'mohren'], fr: ['carotte', 'carottes'],
      it: ['carota', 'carote'], pt: ['cenoura', 'cenouras'],
    },
  },
  {
    key: 'pepper-veg',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['pimiento', 'pimientos'], en: ['bell pepper', 'peppers'],
      de: ['paprika'], fr: ['poivron', 'poivrons'],
      it: ['peperone', 'peperoni'], pt: ['pimento', 'pimentos'],
    },
  },
  {
    key: 'zucchini',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['calabacin'], en: ['zucchini', 'courgette'], de: ['zucchini'],
      fr: ['courgette'], it: ['zucchina', 'zucchine'], pt: ['courgette'],
    },
  },
  {
    key: 'spinach',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['espinacas'], en: ['spinach'], de: ['spinat'],
      fr: ['epinards'], it: ['spinaci'], pt: ['espinafres'],
    },
  },
  {
    key: 'broccoli',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['brocoli'], en: ['broccoli'], de: ['brokkoli'],
      fr: ['brocoli'], it: ['broccoli'], pt: ['brocolos'],
    },
  },
  {
    key: 'mushroom',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['champinones', 'setas'], en: ['mushrooms'],
      de: ['champignons', 'pilze'], fr: ['champignons'],
      it: ['funghi'], pt: ['cogumelos'],
    },
  },
  {
    key: 'cucumber',
    foodType: FoodType.VEGETABLE,
    terms: {
      es: ['pepino'], en: ['cucumber'], de: ['gurke'],
      fr: ['concombre'], it: ['cetriolo'], pt: ['pepino'],
    },
  },
  {
    key: 'apple',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['manzana', 'manzanas'], en: ['apple', 'apples'],
      de: ['apfel', 'apfel'], fr: ['pomme', 'pommes'],
      it: ['mela', 'mele'], pt: ['maca', 'macas'],
    },
  },
  {
    key: 'banana',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['platano', 'platanos', 'banana'], en: ['banana', 'bananas'],
      de: ['banane', 'bananen'], fr: ['banane', 'bananes'],
      it: ['banana', 'banane'], pt: ['banana', 'bananas'],
    },
  },
  {
    key: 'orange',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['naranja', 'naranjas'], en: ['orange', 'oranges'],
      de: ['orange', 'orangen'], fr: ['orange', 'oranges'],
      it: ['arancia', 'arance'], pt: ['laranja', 'laranjas'],
    },
  },
  {
    key: 'strawberry',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['fresa', 'fresas'], en: ['strawberry', 'strawberries'],
      de: ['erdbeere', 'erdbeeren'], fr: ['fraise', 'fraises'],
      it: ['fragola', 'fragole'], pt: ['morango', 'morangos'],
    },
  },
  {
    key: 'pear',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['pera', 'peras'], en: ['pear', 'pears'],
      de: ['birne', 'birnen'], fr: ['poire', 'poires'],
      it: ['pera', 'pere'], pt: ['pera', 'peras'],
    },
  },
  {
    key: 'grape',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['uva', 'uvas'], en: ['grapes'], de: ['trauben'],
      fr: ['raisin', 'raisins'], it: ['uva'], pt: ['uvas'],
    },
  },
  {
    key: 'melon',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['melon', 'sandia'], en: ['melon', 'watermelon'],
      de: ['melone'], fr: ['melon', 'pasteque'],
      it: ['melone', 'anguria'], pt: ['melao', 'melancia'],
    },
  },
  {
    key: 'peach',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['melocoton', 'nectarina'], en: ['peach', 'nectarine'],
      de: ['pfirsich'], fr: ['peche', 'nectarine'],
      it: ['pesca', 'pesche'], pt: ['pessego'],
    },
  },
  {
    key: 'avocado',
    foodType: FoodType.FRUIT,
    terms: {
      es: ['aguacate'], en: ['avocado'], de: ['avocado'],
      fr: ['avocat'], it: ['avocado'], pt: ['abacate'],
    },
  },
```

- [ ] **Step 2: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 8/8.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/domain/pantry/food-concepts.data.ts
git commit -m "feat(pantry): add vegetable and fruit concepts to food dictionary"
```

---

### Task 5: Diccionario — hogar, bebidas y test de integridad

**Files:**
- Modify: `src/app/core/domain/pantry/food-concepts.data.ts`
- Modify: `src/app/core/domain/pantry/food-type-inference.domain.spec.ts`

- [ ] **Step 1: Add the household and drink concepts**

Insertar en el array, antes del cierre `];`:

```ts
  {
    key: 'toilet-paper',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['papel higienico'], en: ['toilet paper'], de: ['toilettenpapier'],
      fr: ['papier toilette'], it: ['carta igienica'], pt: ['papel higienico'],
    },
  },
  {
    key: 'detergent',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['detergente', 'jabon'], en: ['detergent', 'soap'],
      de: ['waschmittel', 'seife'], fr: ['lessive', 'savon'],
      it: ['detersivo', 'sapone'], pt: ['detergente', 'sabao'],
    },
  },
  {
    key: 'dish-soap',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['lavavajillas'], en: ['dish soap', 'dishwasher tablets'],
      de: ['spulmittel'], fr: ['liquide vaisselle'],
      it: ['detersivo piatti'], pt: ['detergente loica'],
    },
  },
  {
    key: 'bleach',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['lejia'], en: ['bleach'], de: ['bleichmittel'],
      fr: ['javel'], it: ['candeggina'], pt: ['lixivia'],
    },
  },
  {
    key: 'shampoo',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['champu'], en: ['shampoo'], de: ['shampoo'],
      fr: ['shampooing'], it: ['shampoo'], pt: ['champo'],
    },
  },
  {
    key: 'toothpaste',
    foodType: FoodType.HOUSEHOLD,
    terms: {
      es: ['pasta de dientes', 'dentifrico'], en: ['toothpaste'],
      de: ['zahnpasta'], fr: ['dentifrice'],
      it: ['dentifricio'], pt: ['pasta de dentes'],
    },
  },
  {
    key: 'water',
    foodType: FoodType.OTHER,
    terms: {
      es: ['agua'], en: ['water'], de: ['wasser'],
      fr: ['eau'], it: ['acqua'], pt: ['agua'],
    },
  },
  {
    key: 'juice',
    foodType: FoodType.OTHER,
    terms: {
      es: ['zumo'], en: ['juice'], de: ['saft'],
      fr: ['jus'], it: ['succo'], pt: ['sumo'],
    },
  },
  {
    key: 'beer',
    foodType: FoodType.OTHER,
    terms: {
      es: ['cerveza'], en: ['beer'], de: ['bier'],
      fr: ['biere'], it: ['birra'], pt: ['cerveja'],
    },
  },
  {
    key: 'wine',
    foodType: FoodType.OTHER,
    terms: {
      es: ['vino'], en: ['wine'], de: ['wein'],
      fr: ['vin'], it: ['vino'], pt: ['vinho'],
    },
  },
```

- [ ] **Step 2: Write the data integrity test**

Primero añadir estos imports **arriba del fichero**, junto a los existentes:

```ts
import { FOOD_CONCEPTS } from './food-concepts.data';
import { SUPPORTED_LANGUAGES } from '@core/constants';
import { normalizeSearchQuery } from '@core/utils/normalization.util';
```

Después añadir este bloque al final del fichero:

```ts
describe('FOOD_CONCEPTS data integrity', () => {
  it('has a unique key per concept', () => {
    const keys = FOOD_CONCEPTS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares at least one term for every supported language', () => {
    for (const concept of FOOD_CONCEPTS) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const terms = concept.terms[lang];
        expect(terms?.length)
          .withContext(`concept "${concept.key}" is missing terms for "${lang}"`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('stores every term already normalised (lowercase, unaccented)', () => {
    for (const concept of FOOD_CONCEPTS) {
      for (const terms of Object.values(concept.terms)) {
        for (const term of terms) {
          expect(term)
            .withContext(`concept "${concept.key}" has a non-normalised term`)
            .toBe(normalizeSearchQuery(term));
        }
      }
    }
  });

  it('resolves every declared term back to its own foodType', () => {
    // Guards against a term being silently shadowed by an earlier concept.
    // A shadowed term is allowed only if both concepts share the same foodType.
    for (const concept of FOOD_CONCEPTS) {
      for (const terms of Object.values(concept.terms)) {
        for (const term of terms) {
          expect(inferFoodType(term))
            .withContext(`term "${term}" (concept "${concept.key}") resolves elsewhere`)
            .toBe(concept.foodType);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 12/12.

Si el último test falla, significa que un término está declarado en dos conceptos con **distinto** `foodType`. La corrección es elegir cuál gana y quitar el término del otro concepto — no reordenar el array, porque el orden sirve para otras cosas.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/domain/pantry/food-concepts.data.ts src/app/core/domain/pantry/food-type-inference.domain.spec.ts
git commit -m "feat(pantry): add household and drink concepts, add dictionary integrity tests"
```

---

### Task 6: Helper `inferExpiryForName`

**Files:**
- Modify: `src/app/core/domain/pantry/food-type-inference.domain.ts`
- Modify: `src/app/core/domain/pantry/food-type-inference.domain.spec.ts`
- Modify: `src/app/core/domain/pantry/index.ts`

- [ ] **Step 1: Write the failing test**

Primero ampliar los imports **arriba del fichero**: añadir `inferExpiryForName` al import existente de `./food-type-inference.domain`, y añadir una línea nueva:

```ts
import { EXPIRY_SUGGESTION_DAYS } from './expiry-suggestion.domain';
```

Después añadir este bloque al final del fichero:

```ts
describe('inferExpiryForName', () => {
  const from = new Date('2026-01-01T12:00:00');

  it('returns the foodType and a suggested date for a known term', () => {
    const result = inferExpiryForName('leche', from);
    expect(result.foodType).toBe(FoodType.DAIRY);
    // DAIRY shelf life comes from the shared table, not a literal here
    const days = EXPIRY_SUGGESTION_DAYS[FoodType.DAIRY];
    const expected = new Date(from);
    expected.setDate(expected.getDate() + days);
    const y = expected.getFullYear();
    const m = String(expected.getMonth() + 1).padStart(2, '0');
    const d = String(expected.getDate()).padStart(2, '0');
    expect(result.expirationDate).toBe(`${y}-${m}-${d}`);
  });

  it('returns nulls for an unknown term so callers keep current behaviour', () => {
    const result = inferExpiryForName('xyzzy', from);
    expect(result.foodType).toBeNull();
    expect(result.expirationDate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `inferExpiryForName` no exportado.

- [ ] **Step 3: Implement the helper**

Añadir al final de `food-type-inference.domain.ts`:

```ts
import { suggestExpiryDate } from './expiry-suggestion.domain';

export interface InferredExpiry {
  foodType: FoodType | null;
  /** `YYYY-MM-DD`, or undefined when the name could not be recognised. */
  expirationDate: string | undefined;
}

/**
 * Convenience wrapper: infer the food type from a product name and derive the
 * suggested expiry date from it. Returns undefined dates for unknown names so
 * every caller can keep its existing "no date" behaviour unchanged.
 */
export function inferExpiryForName(name: string, fromDate: Date = new Date()): InferredExpiry {
  const foodType = inferFoodType(name);
  return {
    foodType,
    expirationDate: foodType ? suggestExpiryDate(foodType, fromDate) : undefined,
  };
}
```

Nota: el `import` va arriba del fichero junto a los demás, no en medio.

- [ ] **Step 4: Export from the domain barrel**

En `src/app/core/domain/pantry/index.ts`, añadir al final:

```ts
export * from './food-type-inference.domain';
export * from './food-concepts.data';
```

- [ ] **Step 5: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/food-type-inference.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 14/14.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/domain/pantry/food-type-inference.domain.ts src/app/core/domain/pantry/food-type-inference.domain.spec.ts src/app/core/domain/pantry/index.ts
git commit -m "feat(pantry): add inferExpiryForName composing inference with expiry suggestion"
```

---

### Task 7: Enganche principal — `buildAddItemPayload`

**Files:**
- Modify: `src/app/core/domain/pantry/pantry-builder.domain.ts`
- Modify: `src/app/core/domain/pantry/pantry-builder.domain.spec.ts` (crear si no existe)

Este es el enganche de mayor alcance: `buildAddItemPayload()` lo comparten **tres** flujos de alta — alta rápida (`pantry-add-modal-state.service.ts`), compra manual de lista (`list-state.service.ts:167`) e import de ticket (`pantry-receipt-scan-modal-state.service.ts:285`).

- [ ] **Step 1: Write the failing test**

Crear `src/app/core/domain/pantry/pantry-builder.domain.spec.ts`:

```ts
import { FoodType } from '@core/models/shared/enums.model';
import { buildAddItemPayload } from './pantry-builder.domain';

describe('buildAddItemPayload — foodType inference', () => {
  const base = { id: 'item:1', nowIso: '2026-01-01T12:00:00.000Z', quantity: 1 };

  it('infers foodType and fills the batch expiry for a known name', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche' });
    expect(item.foodType).toBe(FoodType.DAIRY);
    expect(item.batches[0].expirationDate).toBeDefined();
    expect(item.expirationDate).toBe(item.batches[0].expirationDate);
  });

  it('leaves foodType and expiry unset for an unknown name', () => {
    const item = buildAddItemPayload({ ...base, name: 'xyzzy' });
    expect(item.foodType).toBeUndefined();
    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('never overrides an explicit expirationDate from the caller', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche', expirationDate: '2026-03-15' });
    expect(item.batches[0].expirationDate).toBe('2026-03-15');
    expect(item.foodType).toBe(FoodType.DAIRY);
  });

  it('never sets an expiry when the caller marked the batch noExpiry', () => {
    const item = buildAddItemPayload({ ...base, name: 'leche', noExpiry: true });
    expect(item.batches[0].expirationDate).toBeUndefined();
    expect(item.batches[0].noExpiry).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='src/app/core/domain/pantry/pantry-builder.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `item.foodType` es `undefined` en el primer test.

- [ ] **Step 3: Apply the inference in the builder**

En `src/app/core/domain/pantry/pantry-builder.domain.ts`:

Añadir el import arriba:

```ts
import { inferExpiryForName } from './food-type-inference.domain';
```

Sustituir el bloque que construye `batches` y el `return`, dejando el resto de la función igual:

```ts
  // Infer the food type from the name so the item is visible to the expiry
  // alert system from day one. An explicit date or an explicit noExpiry from
  // the caller always wins; an unrecognised name falls back to no date, which
  // is the behaviour this function had before inference existed.
  const inferred = inferExpiryForName(normalizedName, new Date(params.nowIso));
  const shouldInferDate = !params.expirationDate && !params.noExpiry;

  const batches: ItemBatch[] = [
    {
      quantity: roundQuantity(Math.max(1, sanitizedQuantity)),
      locationId: normalizeTrim(params.defaultLocationId ?? '') || undefined,
      expirationDate: params.expirationDate ?? (shouldInferDate ? inferred.expirationDate : undefined),
      noExpiry: params.noExpiry || undefined,
    },
  ];

  return {
    _id: params.id,
    type: 'item',
    householdId: params.householdId ?? DEFAULT_HOUSEHOLD_ID,
    name: normalizedName,
    categoryId: '',
    foodType: inferred.foodType ?? undefined,
    batches,
    supermarket: '',
    isBasic: undefined,
    minThreshold: undefined,
    expirationDate: computeEarliestExpiry(batches),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
```

- [ ] **Step 4: Run tests**

Run: `npx ng test --include='src/app/core/domain/pantry/pantry-builder.domain.spec.ts' --watch=false --browsers=ChromeHeadless`
Expected: PASS — 4/4.

- [ ] **Step 5: Run the whole suite to catch regressions**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS. Los items creados por este builder ahora llevan `foodType` y fecha, así que cualquier test que asumiera lo contrario fallará aquí — arreglarlo actualizando la expectativa, no revirtiendo la inferencia.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/domain/pantry/pantry-builder.domain.ts src/app/core/domain/pantry/pantry-builder.domain.spec.ts
git commit -m "feat(pantry): infer foodType and expiry when building a new item"
```

---

### Task 8: Chip visible en el modal de alta

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts:185-194, 232-241`

La Task 7 aplica la inferencia al **enviar**, así que la fecha aparecería en silencio. La decisión de diseño aprobada es que el usuario **vea** lo que la app dedujo y pueda corregirlo antes de guardar. `AddEntry` ya tiene el campo `expirationDate` (`add.model.ts:9`) y el chip del modal ya lo pinta; solo falta rellenarlo al crear la fila.

- [ ] **Step 1: Add the import**

En `src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts`:

```ts
import { inferExpiryForName } from '@core/domain/pantry/food-type-inference.domain';
import { suggestExpiryDate } from '@core/domain/pantry/expiry-suggestion.domain';
```

- [ ] **Step 2: Pre-fill the date when adding an existing item (addEntry)**

Sustituir el bloque de creación de entry en `addEntry()` (líneas 185-194):

```ts
      return [
        ...current,
        {
          id: `add:${item._id}`,
          name: option.title,
          quantity: 1,
          item,
          isNew: false,
          // Show the suggested expiry up front so the user can accept or edit
          // it before saving, instead of discovering it afterwards.
          expirationDate: item.foodType
            ? suggestExpiryDate(item.foodType)
            : inferExpiryForName(option.title).expirationDate,
        },
      ];
```

- [ ] **Step 3: Pre-fill the date when creating a new product (addEntryFromQuery)**

Sustituir el bloque de creación de entry en `addEntryFromQuery()` (líneas 232-241):

```ts
      return [
        ...current,
        {
          id: `add:new:${normalized}`,
          name: formattedName,
          quantity: 1,
          isNew: true,
          expirationDate: inferExpiryForName(formattedName).expirationDate,
        },
      ];
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: sin errores.

- [ ] **Step 5: Run the whole suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-add-modal-state.service.ts
git commit -m "feat(pantry): show the inferred expiry date in the add modal"
```

---

### Task 9: Enganche `addNewLot` — lista de compra y ticket

**Files:**
- Modify: `src/app/core/services/list/list-state.service.ts:96-148`
- Modify: `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts:278`

Estos dos caminos añaden un lote a un producto **ya existente**, y hoy lo hacen sin fecha. Son los productos de mayor rotación (69 compras medidas), justo los que más necesitan caducidad.

- [ ] **Step 1: Add the inference to the shopping-list buy path**

En `src/app/core/services/list/list-state.service.ts`, añadir el import:

```ts
import { inferExpiryForName } from '@core/domain/pantry/food-type-inference.domain';
```

Dentro de `markAsBought()`, en la rama `else` (producto de despensa, no fresco), sustituir:

```ts
        const previous = suggestion.item;
        const updated = await this.pantryStore.addNewLot(id, { quantity });
```

por:

```ts
        const previous = suggestion.item;
        // Restocking an existing product: derive the expiry from the product's
        // own foodType when it has one, otherwise infer it from its name. Without
        // this the new lot is dateless and invisible to every expiry alert.
        const expiryDate = previous.foodType
          ? suggestExpiryDate(previous.foodType)
          : inferExpiryForName(previous.name).expirationDate;
        const updated = await this.pantryStore.addNewLot(id, { quantity, expiryDate });
```

Añadir también el import de `suggestExpiryDate`:

```ts
import { suggestExpiryDate } from '@core/domain/pantry/expiry-suggestion.domain';
```

Nota: el parámetro de `addNewLot` se llama `expiryDate` (no `expirationDate`) — ver `pantry-query.service.ts:185-188`.

- [ ] **Step 2: Add the inference to the receipt matched-item path**

En `src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts`, añadir los mismos dos imports, y en la línea 278 sustituir:

```ts
            : await this.pantryStore.addNewLot(matchedItem._id, { quantity: line.quantity });
```

por:

```ts
            : await this.pantryStore.addNewLot(matchedItem._id, {
                quantity: line.quantity,
                expiryDate: matchedItem.foodType
                  ? suggestExpiryDate(matchedItem.foodType)
                  : inferExpiryForName(matchedItem.name).expirationDate,
              });
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: sin errores.

- [ ] **Step 4: Run the whole suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/list/list-state.service.ts src/app/core/services/pantry/modals/pantry-receipt-scan-modal-state.service.ts
git commit -m "feat(pantry): give restocked lots an inferred expiry date"
```

---

### Task 10: Pre-rellenar el chip en la sheet de pendientes

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts`

Ataca el backlog ya acumulado: los items existentes sin `foodType` llegan con el chip sugerido pre-seleccionado, y como la fila queda "resuelta" el botón "Guardar todo" se habilita solo (comportamiento ya implementado en 5.2).

- [ ] **Step 1: Apply the inference in buildRow**

Añadir el import:

```ts
import { inferFoodType } from '@core/domain/pantry/food-type-inference.domain';
```

Sustituir el método `buildRow()` completo por:

```ts
  private buildRow(item: PantryItem): PendienteRow {
    // For items missing a foodType, offer the inferred one as a pre-selection
    // so the user confirms rather than picks from scratch.
    const foodType = item.foodType ?? inferFoodType(item.name) ?? null;
    const needsFoodType = !item.foodType;
    const needsDate = hasMissingExpiry(item);
    return {
      itemId: item._id,
      name: item.name,
      needsFoodType,
      needsDate,
      datelessBatchCount: countMissingExpiryBatches(item),
      foodType,
      expirationDate: foodType && needsDate ? suggestExpiryDate(foodType) : undefined,
      noExpiry: false,
    };
  }
```

Nota: la fecha ahora se pre-rellena en cuanto hay un `foodType` — propio o inferido — no solo cuando el item ya lo tenía. Eso es coherente con `isPendienteRowResolved()`, que ya considera lista una fila con todos sus campos cubiertos vengan de donde vengan.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: sin errores.

- [ ] **Step 3: Run the whole suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/pantry/modals/pantry-pendientes-sheet-state.service.ts
git commit -m "feat(pantry): pre-select inferred foodType in the pendientes sheet"
```

---

### Task 11: Verificación manual en navegador

Ningún test automático cubre el recorrido completo. Los tres bugs reales de la sesión anterior pasaron 436 tests y tres rondas de revisión, y solo aparecieron aquí.

- [ ] **Step 1: Run the full suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS, sin regresiones.

- [ ] **Step 2: Start the dev server and open the app**

Usar `preview_start` con la config `pantry-manager` de `.claude/launch.json` (puerto 4200).

- [ ] **Step 3: Verify the add flow shows an inferred date**

Despensa → botón añadir → escribir `leche` → "Crear producto: leche". **Verificar que el chip de fecha muestra una fecha estimada** (hoy + 14 días) en vez de "Añadir fecha". Pulsar "Añadir".

- [ ] **Step 4: Verify the item lands with foodType and date**

En la lista, el producto debe mostrar su caducidad. Abrir su modal de edición y confirmar que el campo "Tipo de alimento" viene relleno como Lácteo.

- [ ] **Step 5: Verify an unknown name still behaves like before**

Añadir un producto llamado `xyzzy`. Debe crearse **sin** fecha y aparecer en el chip "Pendientes" — comportamiento idéntico al actual.

- [ ] **Step 6: Verify the pendientes sheet pre-selects**

Con el producto `xyzzy` pendiente, abrir la sheet "Completar pendientes" desde el enlace bajo los chips. Comprobar que las filas de productos con nombre reconocible llegan con su chip de tipo ya marcado y fecha propuesta, y que "Guardar todo" está habilitado sin tocar nada.

- [ ] **Step 7: Verify the dashboard today block wakes up**

Volver a Inicio. Con productos que ahora sí tienen fecha, el bloque "Recomendado para hoy" debe dejar de decir "Todo bajo control" en cuanto alguno entre en ventana de caducidad — que es el objetivo último de toda esta feature. Si ninguno está cerca de caducar todavía, verificar al menos que el aviso de "faltan fechas" ya no aparece.

- [ ] **Step 8: Take a screenshot**

Capturar el flujo de alta con la fecha inferida visible y compartirlo como evidencia.
