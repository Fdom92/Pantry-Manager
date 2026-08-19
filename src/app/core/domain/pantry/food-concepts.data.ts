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

  // ── Dairy ────────────────────────────────────────────────────────────────
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

  // ── Protein ──────────────────────────────────────────────────────────────
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
];
