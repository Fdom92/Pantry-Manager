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

  // ── Carbs and dry pantry ─────────────────────────────────────────────────
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

  // ── Condiments and drinks (OTHER) ────────────────────────────────────────
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

  // ── Vegetables ───────────────────────────────────────────────────────────
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

  // ── Fruit ────────────────────────────────────────────────────────────────
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

  // ── Household ────────────────────────────────────────────────────────────
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

  // ── Drinks ───────────────────────────────────────────────────────────────
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
];
