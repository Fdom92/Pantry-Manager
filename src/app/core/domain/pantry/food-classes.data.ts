import { FoodType } from '@core/models/shared/enums.model';
import type { FoodClass } from './food-classes.model';

/**
 * Master table of storage classes: the single source of food type, shelf life
 * and pantry/fresh for a product.
 *
 * GROWTH RULE: a new product is a new term in an existing class. A new class
 * only enters when its sealedDays or openedDays clearly differ from every
 * other class of its type (or it is a preparation that must beat its
 * ingredients).
 *
 * Terms are matched after normalizeForClassification(); a term may belong to
 * one class only (enforced by the spec). Write terms in the singular: the
 * matcher folds a trailing -s/-es, so only irregular plurals ("nueces",
 * "strawberries", German and Italian plurals) are listed.
 *
 * Days: USDA FoodKeeper, LOW end of each range, from the FSIS FoodKeeper
 * dataset (mirrored as CSV in github.com/jelera/food-shelflife-db). Where a
 * class groups several FoodKeeper rows it takes the lowest. "fridge" = the
 * Refrigerator column, "opened" = after opening, "pantry" = the Pantry column.
 * thawDays of raw meat and fish = the fridge time of the raw product (food
 * thawed in the fridge is treated as fresh); FoodKeeper has no thaw column
 * for them. Months = 30 days, years = 365.
 *
 * Ambiguous generics resolve to the class that lasts less among the
 * reasonable ones; what the household learns corrects it.
 */
const FK = 'USDA FoodKeeper';
const NDSU = 'NDSU Extension FN579 Food Storage Guide (2023)';
const LEGACY = 'legacy FOOD_TYPE_PROFILE';
const NO_TERMS = { es: [], en: [], de: [], fr: [], it: [], pt: [] } as const;

const GENERIC_CLASSES: readonly FoodClass[] = [
  // Lowered from 5: raw poultry, mince and fish last 1-2 days in FoodKeeper, so 5 overshoots every raw protein.
  { key: 'generic-protein', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 2, openedDays: null, thawDays: null, source: `${FK}: raw poultry, ground meat and fish, fridge 1-2 days (high end, as the type is unknown)`, terms: NO_TERMS },
  { key: 'generic-vegetable', foodType: FoodType.VEGETABLE, storage: 'fresh', sealedDays: 7, openedDays: 4, thawDays: null, source: LEGACY, terms: NO_TERMS },
  { key: 'generic-fruit', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 7, openedDays: 3, thawDays: null, source: LEGACY, terms: NO_TERMS },
  // Lowered from 14: fresh milk lasts 5 days (NDSU), and dairy spoilage is a safety issue, not only quality.
  { key: 'generic-dairy', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 5, openedDays: 4, thawDays: null, source: `${NDSU}: milk 5 days; legacy opened 4`, terms: NO_TERMS },
  { key: 'generic-carb', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 270, openedDays: null, thawDays: null, source: LEGACY, terms: NO_TERMS },
  { key: 'generic-non-perishable', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 540, openedDays: null, thawDays: null, source: LEGACY, terms: NO_TERMS },
  { key: 'generic-beverage', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: 180, openedDays: 5, thawDays: null, source: LEGACY, terms: NO_TERMS },
  { key: 'generic-other', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 120, openedDays: 5, thawDays: null, source: LEGACY, terms: NO_TERMS },
  { key: 'generic-household', foodType: FoodType.HOUSEHOLD, storage: 'pantry', sealedDays: null, openedDays: null, thawDays: null, source: LEGACY, terms: NO_TERMS },
];

const PROTEIN_CLASSES: readonly FoodClass[] = [
  {
    key: 'fresh-meat', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: 3,
    source: `${FK}: beef, pork, lamb, veal steaks, chops and roasts, fridge 3-5 days`,
    terms: {
      es: ['carne', 'ternera', 'vaca', 'buey', 'cerdo', 'magro', 'lomo de cerdo', 'solomillo', 'chuleta', 'costilla', 'entrecot', 'cordero', 'conejo', 'cabrito', 'carrillada', 'secreto', 'presa', 'pluma', 'panceta', 'jarrete', 'aguja', 'redondo', 'cinta de lomo', 'escalope', 'higado', 'rinon', 'osobuco', 'churrasco', 'pinchos morunos'],
      en: ['meat', 'beef', 'steak', 'pork', 'pork chop', 'pork loin', 'lamb', 'veal', 'rabbit', 'ribs', 'brisket', 'sirloin', 'tenderloin', 'roast', 'stew meat', 'liver', 'goat'],
      de: ['fleisch', 'rindfleisch', 'schweinefleisch', 'steak', 'kotelett', 'schnitzel', 'lammfleisch', 'kalbfleisch', 'gulasch', 'braten', 'filet'],
      fr: ['viande', 'boeuf', 'porc', 'steak', 'cote de porc', 'agneau', 'veau', 'lapin', 'roti', 'escalope de veau', 'entrecote', 'filet mignon'],
      it: ['carne', 'manzo', 'maiale', 'bistecca', 'braciola', 'agnello', 'vitello', 'coniglio', 'arrosto', 'filetto', 'costine'],
      pt: ['carne', 'vaca', 'novilho', 'porco', 'bife', 'costeleta', 'borrego', 'cordeiro', 'vitela', 'coelho', 'lombo', 'entrecosto', 'febras'],
    },
  },
  {
    key: 'minced-meat', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 1, openedDays: null, thawDays: 1,
    source: `${FK}: ground beef/pork/poultry, raw sausage, fresh chorizo and bratwurst, fridge 1-2 days`,
    terms: {
      // Longaniza is sold raw and cured; the raw one is the shorter.
      es: ['carne picada', 'picada', 'hamburguesa', 'burger', 'albondiga', 'chorizo fresco', 'longaniza', 'butifarra', 'salchicha fresca', 'morcilla', 'chistorra'],
      // "sausage" alone is the raw kind in FoodKeeper; the cooked one is "hot dog".
      en: ['ground beef', 'ground pork', 'ground turkey', 'ground chicken', 'mince', 'minced meat', 'burger', 'hamburger', 'patty', 'meatball', 'sausage', 'bratwurst'],
      de: ['hackfleisch', 'gehacktes', 'hack', 'bratwurst', 'frikadelle', 'bulette', 'hamburger'],
      fr: ['viande hachee', 'steak hache', 'hache', 'saucisse', 'merguez', 'chipolata', 'boulette', 'hamburger'],
      it: ['carne macinata', 'macinato', 'salsiccia', 'polpetta', 'hamburger'],
      pt: ['carne picada', 'hamburguer', 'almondega', 'linguica', 'salsicha fresca', 'chourico fresco'],
    },
  },
  {
    key: 'poultry', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 1, openedDays: null, thawDays: 1,
    source: `${FK}: chicken, turkey and duck, whole or parts, fridge 1-2 days`,
    terms: {
      // "pavo" and "pechuga de pavo" are also sold as cold cuts; raw poultry is the shorter.
      es: ['pollo', 'pechuga', 'pechuga de pollo', 'pech pollo', 'muslo', 'contramuslo', 'alita', 'jamoncito', 'pavo', 'pechuga de pavo', 'pato', 'codorniz', 'gallina', 'picantones', 'pollo adobado', 'pollo asado'],
      en: ['chicken', 'chicken breast', 'chicken thigh', 'chicken wing', 'drumstick', 'turkey', 'duck', 'quail', 'poultry', 'rotisserie chicken'],
      de: ['hahnchen', 'huhn', 'hahnchenbrust', 'hahnchenschenkel', 'chicken wings', 'pute', 'putenbrust', 'truthahn', 'ente', 'geflugel'],
      fr: ['poulet', 'blanc de poulet', 'cuisse de poulet', 'aile de poulet', 'dinde', 'escalope de dinde', 'canard', 'volaille', 'pintade', 'caille'],
      it: ['pollo', 'petto di pollo', 'coscia di pollo', 'ali di pollo', 'tacchino', 'anatra', 'quaglia'],
      pt: ['frango', 'peito de frango', 'coxa de frango', 'asa de frango', 'peru', 'pato', 'galinha', 'codorniz'],
    },
  },
  {
    key: 'fresh-fish', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 1, openedDays: null, thawDays: 1,
    source: `${FK}: lean and fatty fish, fridge 1-2 days`,
    terms: {
      // Plain "atún" is the tin; only fresh cuts are named here.
      es: ['pescado', 'merluza', 'salmon', 'bacalao', 'dorada', 'lubina', 'sardina', 'boqueron', 'caballa', 'tilapia', 'panga', 'rape', 'lenguado', 'gallo', 'rodaballo', 'trucha', 'emperador', 'pez espada', 'bonito', 'atun fresco', 'lomo de atun', 'lomo de pescado', 'jurel', 'besugo', 'pescadilla', 'salmonete', 'abadejo', 'perca', 'corvina'],
      en: ['fish', 'salmon', 'cod', 'hake', 'haddock', 'tilapia', 'trout', 'sea bass', 'sea bream', 'sole', 'halibut', 'mackerel', 'sardine', 'swordfish', 'fresh tuna', 'tuna steak', 'pollock', 'fish fillet'],
      de: ['fisch', 'lachs', 'kabeljau', 'dorsch', 'seehecht', 'forelle', 'seelachs', 'scholle', 'makrele', 'thunfischsteak', 'fischfilet', 'dorade', 'wolfsbarsch'],
      fr: ['poisson', 'saumon', 'cabillaud', 'merlu', 'colin', 'truite', 'dorade', 'sole', 'maquereau', 'sardine', 'thon frais', 'filet de poisson', 'lieu', 'loup', 'bar de ligne'],
      it: ['pesce', 'salmone', 'merluzzo', 'nasello', 'orata', 'branzino', 'spigola', 'trota', 'sogliola', 'sgombro', 'sarda', 'pesce spada', 'tonno fresco', 'filetto di pesce'],
      pt: ['peixe', 'salmao', 'pescada', 'dourada', 'robalo', 'sardinha', 'carapau', 'cavala', 'truta', 'linguado', 'espadarte', 'atum fresco', 'filete de peixe', 'tilapia fresca'],
    },
  },
  {
    key: 'seafood', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 1, openedDays: null, thawDays: 1,
    source: `${FK}: shrimp, squid and scallops fridge 1-3 days; live clams and mussels 1-2 days`,
    terms: {
      es: ['marisco', 'gamba', 'langostino', 'calamar', 'chipiron', 'sepia', 'pulpo', 'mejillon', 'almeja', 'berberecho', 'navaja', 'cigala', 'bogavante', 'langosta', 'centolla', 'necora', 'zamburina', 'vieira', 'ostra', 'carabinero', 'cangrejo'],
      en: ['shrimp', 'prawn', 'squid', 'calamari', 'octopus', 'mussel', 'clam', 'oyster', 'scallop', 'lobster', 'crab', 'seafood', 'cuttlefish'],
      de: ['garnele', 'garnelen', 'shrimps', 'krabben', 'tintenfisch', 'calamari', 'oktopus', 'muschel', 'muscheln', 'miesmuscheln', 'auster', 'jakobsmuschel', 'hummer', 'meeresfruchte'],
      fr: ['crevette', 'gambas', 'calamar', 'encornet', 'seiche', 'poulpe', 'moule', 'palourde', 'huitre', 'coquille saint jacques', 'homard', 'crabe', 'fruits de mer', 'langoustine'],
      it: ['gamberi', 'gamberetti', 'mazzancolle', 'calamari', 'seppia', 'polpo', 'cozze', 'vongole', 'ostriche', 'capesante', 'aragosta', 'granchio', 'frutti di mare', 'scampi'],
      pt: ['marisco', 'camarao', 'gambas', 'lula', 'mexilhao', 'ameijoa', 'berbigao', 'ostra', 'vieira', 'lagosta', 'caranguejo', 'sapateira', 'polvo fresco', 'polvo cozido'],
    },
  },
  {
    key: 'smoked-fish', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 14, openedDays: null, thawDays: null,
    source: `${FK}: fish, cold smoked, air pack, fridge 14-30 days. No FoodKeeper figure after opening`,
    terms: {
      es: ['ahumado', 'salmon ahumado', 'bacalao ahumado', 'trucha ahumada', 'sardina ahumada', 'ahumados'],
      en: ['smoked salmon', 'smoked fish', 'smoked trout', 'smoked mackerel', 'lox', 'kipper'],
      de: ['raucherlachs', 'raucherfisch', 'geraucherter lachs', 'raucherforelle', 'bucklinge'],
      fr: ['saumon fume', 'poisson fume', 'truite fumee', 'haddock fume'],
      it: ['salmone affumicato', 'pesce affumicato', 'trota affumicata', 'pesce spada affumicato'],
      pt: ['salmao fumado', 'peixe fumado', 'salmao defumado', 'truta fumada'],
    },
  },
  {
    key: 'cured-ham', foodType: FoodType.PROTEIN, storage: 'pantry', sealedDays: 60, openedDays: 14, thawDays: null,
    source: `${FK}: prosciutto, fridge 2-3 months; opened from hard dry sausage, sliced, 2-3 weeks (no ham-specific figure)`,
    terms: {
      es: ['jamon serrano', 'jamon iberico', 'jamon curado', 'jamon de bellota', 'jamon de cebo', 'paleta iberica', 'paleta serrana', 'paletilla', 'cecina', 'lomo embuchado', 'lomo iberico', 'cana de lomo'],
      en: ['serrano ham', 'cured ham', 'parma ham', 'iberico ham', 'dry cured ham'],
      de: ['serranoschinken', 'parmaschinken', 'rohschinken', 'schwarzwalder schinken', 'luftgetrockneter schinken'],
      fr: ['jambon cru', 'jambon de bayonne', 'jambon de parme', 'jambon serrano', 'jambon sec'],
      it: ['prosciutto crudo', 'prosciutto di parma', 'prosciutto san daniele', 'bresaola', 'culatello'],
      pt: ['presunto', 'presunto serrano', 'presunto curado', 'paio do lombo'],
    },
  },
  {
    key: 'cured-sausage', foodType: FoodType.PROTEIN, storage: 'pantry', sealedDays: 365, openedDays: 30, thawDays: null,
    source: `${FK}: chorizo, smoked and processed, cooked: pantry 1 year, opened fridge 1 month`,
    terms: {
      es: ['chorizo', 'salchichon', 'fuet', 'salami', 'sobrasada', 'morcon', 'chorizo de pamplona', 'chorizo iberico', 'espetec', 'pepperoni', 'lomo curado', 'longaniza curada'],
      en: ['salami', 'pepperoni', 'chorizo', 'cured sausage', 'dry sausage', 'summer sausage', 'jerky'],
      de: ['salami', 'chorizo', 'mettwurst', 'landjager', 'cabanossi', 'dauerwurst', 'pfefferbeisser'],
      fr: ['saucisson', 'saucisson sec', 'chorizo', 'salami', 'rosette', 'pepperoni'],
      it: ['salame', 'salamino', 'chorizo', 'soppressata', 'nduja', 'cacciatorino', 'pepperoni'],
      pt: ['chourico', 'salpicao', 'paio', 'salame', 'alheira', 'farinheira', 'chorizo'],
    },
  },
  {
    key: 'cooked-cold-cuts', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 14, openedDays: 3, thawDays: null,
    source: `${FK}: luncheon meat, pre-packaged, fridge 2 weeks, opened 3-5 days`,
    terms: {
      // Plain "jamón" and "embutido" are both cured and cooked; the cooked cold cut lasts less.
      es: ['jamon', 'jamon york', 'jamon cocido', 'fiambre', 'embutido', 'pavo en lonchas', 'fiambre de pavo', 'pechuga de pavo en lonchas', 'mortadela', 'chopped', 'cabeza de jabali', 'lacon', 'surimi', 'palito de cangrejo', 'roast beef', 'pastrami', 'pollo en lonchas'],
      en: ['ham', 'cooked ham', 'deli meat', 'lunch meat', 'luncheon meat', 'sliced turkey', 'turkey slices', 'sliced ham', 'bologna', 'mortadella', 'cold cuts', 'pastrami', 'roast beef', 'surimi', 'crab sticks', 'imitation crab'],
      de: ['schinken', 'kochschinken', 'aufschnitt', 'putenaufschnitt', 'mortadella', 'fleischwurst', 'lyoner', 'bierschinken', 'leberkase', 'surimi'],
      fr: ['jambon', 'jambon blanc', 'jambon cuit', 'blanc de dinde', 'charcuterie', 'mortadelle', 'surimi', 'baton de crabe'],
      it: ['prosciutto', 'prosciutto cotto', 'affettato', 'affettati', 'mortadella', 'fesa di tacchino', 'arrosto di tacchino', 'wurstel di pollo', 'surimi'],
      pt: ['fiambre', 'fiambre de peru', 'fiambre de frango', 'mortadela', 'surimi', 'delicias do mar'],
    },
  },
  {
    key: 'bacon-frankfurters', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 7, openedDays: 7, thawDays: null,
    source: `${FK}: bacon fridge 1 week, opened 1 week; hot dogs 2 weeks, opened 1 week`,
    terms: {
      // Spanish "salchichas" are cooked frankfurters; raw ones are "salchicha fresca".
      es: ['salchicha', 'frankfurt', 'salchicha de frankfurt', 'salchicha cocida', 'bacon', 'beicon', 'tocineta', 'bacon ahumado', 'taquito de bacon'],
      en: ['bacon', 'hot dog', 'frankfurter', 'wiener', 'streaky bacon', 'pancetta', 'turkey bacon', 'cocktail sausage'],
      de: ['speck', 'bacon', 'wurstchen', 'wiener wurstchen', 'frankfurter', 'bockwurst', 'schinkenwurfel'],
      fr: ['bacon', 'lardon', 'lardons', 'poitrine fumee', 'saucisse de strasbourg', 'knack', 'saucisse de francfort'],
      it: ['bacon', 'pancetta', 'pancetta affumicata', 'wurstel', 'wurstel di maiale', 'cubetti di pancetta'],
      pt: ['bacon', 'toucinho', 'toucinho fumado', 'salsicha', 'salsichas tipo frankfurt', 'cubos de bacon'],
    },
  },
  {
    key: 'eggs', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 21, openedDays: null, thawDays: null,
    source: `${FK}: eggs in shell, fridge 3-5 weeks; AESAN: best-before at most 28 days from laying, so 21 from purchase holds in Spain`,
    terms: {
      es: ['huevo', 'huevos camperos', 'huevo campero', 'huevo ecologico', 'docena de huevos', 'clara de huevo', 'huevo de codorniz'],
      en: ['egg', 'eggs', 'free range egg', 'organic egg', 'egg white', 'quail egg'],
      de: ['ei', 'eier', 'freilandeier', 'bioeier', 'eiweiss'],
      fr: ['oeuf', 'oeufs', 'oeuf frais', 'blanc d oeuf', 'oeufs de caille'],
      it: ['uovo', 'uova', 'uova fresche', 'albume'],
      pt: ['ovo', 'ovos', 'ovos caseiros', 'ovos de codorniz', 'clara de ovo'],
    },
  },
  {
    key: 'tofu', foodType: FoodType.PROTEIN, storage: 'fresh', sealedDays: 7, openedDays: null, thawDays: null,
    source: `${FK}: tofu, fridge 1 week. Tempeh and seitan grouped here; no FoodKeeper figure after opening`,
    terms: {
      es: ['tofu', 'tempeh', 'seitan', 'heura'],
      en: ['tofu', 'tempeh', 'seitan'],
      de: ['tofu', 'tempeh', 'seitan'],
      fr: ['tofu', 'tempeh', 'seitan'],
      it: ['tofu', 'tempeh', 'seitan'],
      pt: ['tofu', 'tempeh', 'seitan'],
    },
  },
  {
    key: 'frozen-meat-fish', foodType: FoodType.PROTEIN, storage: 'pantry', sealedDays: 60, openedDays: null, thawDays: 1,
    source: `${FK}: freezer, fatty fish 2-3 months (lowest of the group: ground meat 3-4, lean fish 6-8, shrimp 6-18, chicken parts 9)`,
    terms: {
      es: ['pescado congelado', 'carne congelada', 'pollo congelado', 'pechuga congelada', 'alita congelada', 'contramuslo congelado', 'merluza congelada', 'tilapia congelada', 'gamba congelada', 'langostino congelado', 'calamar congelado', 'marisco congelado', 'filete congelado', 'bacalao congelado', 'salmon congelado', 'panga congelado', 'pechuga de pollo congelada'],
      en: ['frozen fish', 'frozen chicken', 'frozen meat', 'frozen shrimp', 'frozen prawn', 'frozen salmon', 'frozen cod', 'frozen chicken breast', 'frozen burger', 'frozen seafood'],
      de: ['tiefkuhlfisch', 'tk fisch', 'tk garnelen', 'tk hahnchen', 'gefrorene garnelen', 'gefrorener fisch'],
      fr: ['poisson surgele', 'viande surgelee', 'poulet surgele', 'crevettes surgelees', 'filet de colin surgele'],
      it: ['pesce surgelato', 'carne surgelata', 'pollo surgelato', 'gamberi surgelati', 'merluzzo surgelato'],
      pt: ['peixe congelado', 'carne congelada', 'frango congelado', 'camarao congelado', 'pescada congelada', 'bacalhau congelado'],
    },
  },
  {
    key: 'frozen-breaded', foodType: FoodType.PROTEIN, storage: 'pantry', sealedDays: 365, openedDays: null, thawDays: 1,
    source: `${FK}: frozen entrees 12 months, breaded fish 18 months (freezer); chicken nuggets after thawing 1-2 days`,
    terms: {
      es: ['croqueta', 'cachopo', 'cachopo pollo', 'cachopo de pollo', 'nugget', 'nuggets de pollo', 'varitas de merluza', 'varita de pescado', 'palitos de pescado', 'empanadilla', 'san jacobo', 'flamenquin', 'calamares a la romana', 'rabas', 'pollo empanado', 'chicken tenders', 'fingers de pollo', 'aros de cebolla', 'pescado rebozado'],
      en: ['croquette', 'chicken nugget', 'nugget', 'chicken tender', 'fish finger', 'fish stick', 'breaded fish', 'breaded chicken', 'onion ring', 'chicken strip', 'popcorn chicken', 'chicken kiev'],
      de: ['kroketten', 'chicken nuggets', 'fischstabchen', 'backfisch', 'chicken wings paniert', 'cordon bleu', 'zwiebelringe'],
      fr: ['croquette', 'nugget de poulet', 'nuggets', 'pane de poulet', 'poisson pane', 'batonnets de poisson', 'cordon bleu', 'beignets de calamar'],
      it: ['crocchetta', 'crocchette', 'nuggets di pollo', 'bastoncini di pesce', 'cotoletta', 'pesce impanato', 'anelli di calamaro', 'cordon bleu'],
      pt: ['croquete', 'panado', 'panados de frango', 'nuggets de frango', 'douradinhos', 'filetes panados', 'rissol', 'chamucas', 'argolas de lula'],
    },
  },
];

const DAIRY_CLASSES: readonly FoodClass[] = [
  {
    key: 'fresh-milk', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 5, openedDays: null, thawDays: null,
    source: `${NDSU}: milk, refrigerated 5 days (FoodKeeper defers to the package use-by date)`,
    terms: {
      es: ['leche fresca', 'leche pasteurizada', 'leche del dia', 'leche cruda'],
      // In English-speaking markets and in Germany and Italy most milk sold is fresh, so plain "milk" is fresh there.
      en: ['milk', 'whole milk', 'semi skimmed milk', 'skimmed milk', 'skim milk', 'fresh milk', 'lactose free milk', 'buttermilk'],
      de: ['milch', 'frischmilch', 'vollmilch', 'fettarme milch', 'buttermilch', 'laktosefreie milch'],
      fr: ['lait frais', 'lait cru', 'lait ribot', 'babeurre'],
      it: ['latte', 'latte fresco', 'latte intero', 'latte parzialmente scremato', 'latticello'],
      pt: ['leite fresco', 'leite pasteurizado'],
    },
  },
  {
    key: 'uht-milk', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 180, openedDays: 5, thawDays: null,
    source: `${FK}: milk, shelf-stable, pantry 6-12 months, opened 5-7 days`,
    terms: {
      // Spec ruling: plain "leche" is UHT, as almost all milk sold in Spain, France and Portugal is.
      es: ['leche', 'leche uht', 'leche entera', 'leche semidesnatada', 'leche desnatada', 'leche sin lactosa', 'brick de leche'],
      en: ['uht milk', 'long life milk', 'shelf stable milk'],
      de: ['h milch', 'haltbare milch', 'haltbarmilch'],
      fr: ['lait', 'lait uht', 'lait demi ecreme', 'lait entier', 'lait ecreme', 'lait sans lactose'],
      it: ['latte uht', 'latte a lunga conservazione', 'latte scremato'],
      pt: ['leite', 'leite uht', 'leite meio gordo', 'leite magro', 'leite gordo', 'leite sem lactose'],
    },
  },
  {
    key: 'powdered-milk', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 1095, openedDays: 90, thawDays: null,
    source: `${FK}: powdered milk, pantry 3-5 years, opened 3 months`,
    terms: {
      es: ['leche en polvo', 'leche de continuacion', 'leche infantil'],
      en: ['powdered milk', 'milk powder', 'dry milk', 'baby formula', 'infant formula'],
      de: ['milchpulver', 'trockenmilch', 'babymilch', 'saeuglingsnahrung'],
      fr: ['lait en poudre', 'lait infantile', 'lait de croissance'],
      it: ['latte in polvere', 'latte artificiale'],
      pt: ['leite em po', 'leite infantil'],
    },
  },
  {
    key: 'plant-drink', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 180, openedDays: 7, thawDays: null,
    source: `${FK}: soy, rice and almond beverage, opened 7-10 days. Sealed: no FoodKeeper figure, uses shelf-stable milk (6-12 months) as the same carton technology`,
    terms: {
      // On Spanish tickets "soja" alone is the drink; the sauce is "salsa de soja".
      es: ['bebida vegetal', 'bebida de avena', 'bebida de soja', 'bebida de almendra', 'bebida de arroz', 'bebida de coco', 'leche de avena', 'leche de soja', 'leche de almendra', 'leche de arroz', 'leche de coco', 'soja', 'horchata'],
      en: ['oat milk', 'soy milk', 'soya milk', 'almond milk', 'rice milk', 'coconut milk', 'plant milk', 'oat drink', 'soya drink', 'almond drink'],
      de: ['hafermilch', 'haferdrink', 'sojamilch', 'sojadrink', 'mandelmilch', 'mandeldrink', 'reismilch', 'kokosmilch', 'pflanzendrink'],
      fr: ['lait d avoine', 'lait de soja', 'lait d amande', 'lait de riz', 'lait de coco', 'boisson vegetale', 'boisson avoine', 'boisson soja'],
      it: ['latte di avena', 'latte di soia', 'latte di mandorla', 'latte di riso', 'latte di cocco', 'bevanda vegetale', 'bevanda di avena', 'bevanda di soia'],
      pt: ['bebida vegetal', 'bebida de aveia', 'bebida de soja', 'bebida de amendoa', 'bebida de arroz', 'leite de soja', 'leite de coco', 'leite de aveia'],
    },
  },
  {
    key: 'milkshake', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 180, openedDays: 5, thawDays: null, preparation: true,
    source: `${FK}: milk, shelf-stable (flavoured), pantry 6-12 months, opened 5-7 days`,
    terms: {
      es: ['batido', 'batido de chocolate', 'batido de fresa', 'batido de vainilla', 'leche con cacao', 'cacaolat', 'leche merengada'],
      en: ['milkshake', 'chocolate milk', 'strawberry milk', 'shake', 'protein shake'],
      de: ['milchshake', 'kakaomilch', 'kakaotrunk', 'erdbeermilch', 'shake'],
      fr: ['milk shake', 'milkshake', 'lait chocolate', 'lait aromatise'],
      it: ['frappe', 'milkshake', 'latte al cioccolato', 'latte aromatizzato'],
      pt: ['batido', 'leite com chocolate', 'leite achocolatado', 'achocolatado', 'milkshake'],
    },
  },
  {
    key: 'yogurt', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 7, openedDays: 1, thawDays: null,
    source: `${FK}: yogurt fridge 1-2 weeks; kefir 1 week, opened 1-2 days`,
    terms: {
      es: ['yogur', 'yogurt', 'yogures', 'yogur griego', 'yogur natural', 'yogur liquido', 'yogur bebible', 'kefir', 'bifidus', 'petit suisse', 'danonino', 'skyr', 'actimel', 'leche fermentada'],
      en: ['yoghurt', 'greek yogurt', 'kefir', 'skyr', 'drinking yogurt', 'petit suisse'],
      de: ['joghurt', 'griechischer joghurt', 'kefir', 'skyr', 'trinkjoghurt', 'quark', 'speisequark'],
      fr: ['yaourt', 'yaourts', 'yogourt', 'yaourt grec', 'kefir', 'skyr', 'faisselle', 'yaourt a boire'],
      it: ['yogurt greco', 'yogurt bianco', 'kefir', 'skyr', 'yogurt da bere'],
      pt: ['iogurte', 'iogurte grego', 'iogurte natural', 'iogurte liquido', 'kefir', 'skyr'],
    },
  },
  {
    key: 'dairy-dessert', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 3, openedDays: 2, thawDays: null, preparation: true,
    source: `${NDSU}: custards and custard-filled products 3-4 days; ${FK}: pudding, opened 2 days`,
    terms: {
      es: ['flan', 'natilla', 'natillas', 'arroz con leche', 'cuajada', 'mousse', 'crema catalana', 'postre lacteo', 'pudin', 'tiramisu', 'panna cotta', 'profiterol'],
      en: ['pudding', 'custard', 'chocolate pudding', 'rice pudding', 'mousse', 'creme caramel', 'flan', 'tiramisu', 'panna cotta'],
      de: ['pudding', 'vanillepudding', 'schokopudding', 'milchreis', 'mousse', 'grießpudding', 'tiramisu', 'panna cotta'],
      fr: ['creme dessert', 'flan', 'creme caramel', 'creme brulee', 'riz au lait', 'mousse au chocolat', 'liegeois', 'tiramisu', 'panna cotta'],
      it: ['budino', 'creme caramel', 'crema pasticcera', 'tiramisu', 'panna cotta', 'mousse'],
      pt: ['pudim', 'leite creme', 'arroz doce', 'mousse', 'tiramisu', 'natas do ceu'],
    },
  },
  {
    key: 'fresh-cheese', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 7, openedDays: null, thawDays: null,
    source: `${FK}: quark 7-10 days, soft cheese 1-2 weeks, ricotta and cottage cheese 2 weeks (opened 1 week)`,
    terms: {
      // Plain "queso" (and "cheese", "fromage"…) is the fresh one: the cheese that lasts less.
      es: ['queso', 'queso fresco', 'queso de burgos', 'requeson', 'ricotta', 'mozzarella', 'burrata', 'mascarpone', 'queso crema', 'queso de untar', 'philadelphia', 'queso philadelphia', 'quesito', 'queso cottage', 'feta', 'queso de cabra', 'rulo de cabra', 'brie', 'camembert', 'queso tierno'],
      en: ['cheese', 'cream cheese', 'cottage cheese', 'mozzarella', 'ricotta', 'mascarpone', 'feta', 'goat cheese', 'brie', 'camembert', 'cheese spread', 'burrata', 'halloumi'],
      de: ['kase', 'frischkase', 'huttenkase', 'mozzarella', 'ricotta', 'mascarpone', 'feta', 'ziegenkase', 'brie', 'camembert', 'schmelzkase', 'hirtenkase'],
      fr: ['fromage', 'fromage frais', 'fromage blanc', 'mozzarella', 'ricotta', 'mascarpone', 'feta', 'chevre', 'brie', 'camembert', 'fromage a tartiner', 'carre frais', 'boursin'],
      it: ['formaggio', 'formaggio fresco', 'mozzarella', 'ricotta', 'mascarpone', 'stracchino', 'crescenza', 'burrata', 'feta', 'caprino', 'brie', 'squacquerone', 'robiola'],
      pt: ['queijo', 'queijo fresco', 'requeijao', 'mozzarella', 'ricotta', 'mascarpone', 'queijo creme', 'queijo de cabra', 'feta', 'brie', 'camembert', 'queijo para barrar'],
    },
  },
  {
    key: 'cured-cheese', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 180, openedDays: 21, thawDays: null,
    source: `${FK}: hard cheese (cheddar, swiss, block parmesan), fridge 6 months, opened 3-4 weeks`,
    terms: {
      es: ['queso curado', 'queso semicurado', 'queso viejo', 'queso anejo', 'queso manchego', 'manchego', 'queso de oveja', 'queso parmesano', 'parmesano', 'queso gouda', 'gouda', 'edam', 'emmental', 'gruyere', 'cheddar', 'queso cheddar', 'grana padano', 'pecorino', 'idiazabal', 'mahon', 'queso azul', 'cabrales', 'roquefort', 'tetilla', 'queso de bola'],
      en: ['cheddar', 'parmesan', 'gouda', 'edam', 'emmental', 'swiss cheese', 'gruyere', 'manchego', 'pecorino', 'hard cheese', 'aged cheese', 'blue cheese', 'stilton', 'red leicester', 'monterey jack', 'colby'],
      de: ['bergkase', 'hartkase', 'gouda', 'edamer', 'emmentaler', 'parmesan', 'gruyere', 'cheddar', 'tilsiter', 'appenzeller', 'manchego', 'pecorino', 'blauschimmelkase'],
      fr: ['comte', 'emmental', 'gruyere', 'parmesan', 'beaufort', 'cantal', 'mimolette', 'tomme', 'gouda', 'cheddar', 'roquefort', 'reblochon', 'raclette', 'manchego'],
      it: ['parmigiano', 'parmigiano reggiano', 'grana', 'pecorino romano', 'pecorino sardo', 'asiago', 'provolone', 'fontina', 'gorgonzola', 'taleggio', 'montasio', 'caciocavallo', 'scamorza'],
      pt: ['queijo curado', 'queijo da serra', 'queijo flamengo', 'queijo parmesao', 'parmesao', 'queijo de ovelha', 'queijo ilha', 'queijo sao jorge', 'queijo azul', 'gouda', 'cheddar'],
    },
  },
  {
    key: 'sliced-grated-cheese', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 21, openedDays: null, thawDays: null,
    source: `${FK}: processed cheese slices, fridge 3-4 weeks; shredded cheese 1 month`,
    terms: {
      es: ['queso rallado', 'queso en lonchas', 'lonchas de queso', 'queso para pizza', 'queso fundido', 'queso en polvo', 'queso de sandwich', 'mozzarella rallada', 'tranchetes'],
      en: ['grated cheese', 'shredded cheese', 'cheese slices', 'sliced cheese', 'processed cheese', 'american cheese', 'pizza cheese', 'string cheese'],
      de: ['reibekase', 'geriebener kase', 'kasescheiben', 'scheibenkase', 'pizzakase', 'schmelzkasescheiben'],
      fr: ['fromage rape', 'emmental rape', 'tranches de fromage', 'fromage en tranches', 'fromage fondu'],
      it: ['formaggio grattugiato', 'grana grattugiato', 'sottilette', 'formaggio a fette', 'fette di formaggio'],
      pt: ['queijo ralado', 'queijo fatiado', 'fatias de queijo', 'queijo em fatias', 'queijo para pizza'],
    },
  },
  {
    key: 'butter', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 30, openedDays: null, thawDays: null,
    source: `${FK}: butter, fridge 1-2 months (margarine 6 months, ghee 6-8 months pantry)`,
    terms: {
      es: ['mantequilla', 'margarina', 'ghee', 'mantequilla con sal', 'tulipan', 'manteca'],
      en: ['butter', 'margarine', 'ghee', 'salted butter', 'unsalted butter', 'spread'],
      de: ['butter', 'margarine', 'ghee', 'butterschmalz', 'sussrahmbutter'],
      fr: ['beurre', 'margarine', 'ghee', 'beurre doux', 'beurre demi sel'],
      it: ['burro', 'margarina', 'ghee', 'burro chiarificato'],
      pt: ['manteiga', 'margarina', 'ghee', 'manteiga com sal'],
    },
  },
  {
    key: 'cream', foodType: FoodType.DAIRY, storage: 'fresh', sealedDays: 30, openedDays: 7, thawDays: null,
    source: `${FK}: cream, whipping, ultrapasteurized (as Spanish UHT cream), fridge 1 month, opened 1 week`,
    terms: {
      es: ['nata', 'nata para montar', 'nata para cocinar', 'nata liquida', 'nata montada', 'crema de leche', 'nata agria', 'crema agria', 'creme fraiche'],
      en: ['cream', 'heavy cream', 'whipping cream', 'double cream', 'single cream', 'sour cream', 'cooking cream', 'whipped cream', 'creme fraiche', 'half and half'],
      de: ['sahne', 'schlagsahne', 'sauerrahm', 'schmand', 'creme fraiche', 'kochsahne', 'saure sahne', 'sahnesteif'],
      fr: ['creme', 'creme fraiche', 'creme liquide', 'creme epaisse', 'creme entiere', 'creme fleurette', 'chantilly'],
      it: ['panna', 'panna da cucina', 'panna fresca', 'panna montata', 'panna acida'],
      pt: ['natas', 'natas para bater', 'natas para culinaria', 'chantilly', 'nata'],
    },
  },
  {
    key: 'ice-cream', foodType: FoodType.DAIRY, storage: 'pantry', sealedDays: 180, openedDays: null, thawDays: null, preparation: true,
    source: `${FK}: ice cream, freezer 6 months (sherbet/sorbet 9)`,
    terms: {
      es: ['helado', 'polo', 'sorbete', 'tarrina de helado', 'bombon helado', 'corneto', 'granizado'],
      en: ['ice cream', 'ice lolly', 'popsicle', 'sorbet', 'sherbet', 'gelato', 'frozen yogurt'],
      de: ['eis', 'eiscreme', 'speiseeis', 'sorbet', 'eis am stiel', 'gelato'],
      fr: ['glace', 'creme glacee', 'sorbet', 'esquimau', 'cornet glace'],
      it: ['gelato', 'sorbetto', 'ghiacciolo', 'cornetto gelato', 'semifreddo'],
      pt: ['gelado', 'sorvete', 'picole', 'gelado de natas'],
    },
  },
];

const CARB_CLASSES: readonly FoodClass[] = [
  {
    key: 'fresh-bread', foodType: FoodType.CARB, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: null,
    source: `${FK}: bread, homemade (bakery bread has no preservatives either), pantry 3-5 days; whole wheat bread 3-5 days; ${NDSU}: bread, rolls 3 days`,
    terms: {
      es: ['pan', 'barra de pan', 'baguette', 'chapata', 'pan de pueblo', 'hogaza', 'pan rustico', 'pan integral', 'pan de centeno', 'pan de semillas', 'pan gallego', 'mollete', 'bollo de pan', 'panecillo', 'pan de espelta', 'focaccia'],
      en: ['bread', 'baguette', 'sourdough', 'loaf', 'rye bread', 'whole wheat bread', 'wholemeal bread', 'ciabatta', 'bread roll', 'focaccia', 'french bread'],
      de: ['brot', 'brotchen', 'semmel', 'baguette', 'vollkornbrot', 'roggenbrot', 'sauerteigbrot', 'ciabatta', 'laugenbrezel', 'brezel', 'mischbrot', 'weissbrot'],
      fr: ['pain', 'baguette', 'pain de campagne', 'pain complet', 'pain de seigle', 'ficelle', 'boule de pain', 'pain aux cereales', 'ciabatta', 'fougasse'],
      it: ['pane', 'baguette', 'pagnotta', 'pane integrale', 'ciabatta', 'focaccia', 'rosetta', 'filone', 'pane di segale', 'michetta'],
      pt: ['pao', 'paes', 'carcaca', 'papo seco', 'broa', 'pao de mistura', 'pao integral', 'baguete', 'pao de centeio', 'bola de pao'],
    },
  },
  {
    key: 'packaged-bread', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 14, openedDays: null, thawDays: null,
    source: `${FK}: commercial bread products (pan breads, flat breads, rolls, buns), pantry 14-18 days`,
    terms: {
      es: ['pan de molde', 'pan bimbo', 'pan de hamburguesa', 'pan de perrito', 'pan de leche', 'pan sin corteza', 'pan sin gluten', 'pan de pita', 'pita', 'tortilla de trigo', 'tortilla mexicana', 'wrap', 'fajita', 'pan tostado', 'pan blanco s/corteza', 'brioche', 'oblea', 'obleas para empanadillas', 'masa de empanada', 'base de pizza'],
      en: ['sliced bread', 'sandwich bread', 'white bread', 'bagel', 'burger bun', 'hot dog bun', 'bun', 'pita bread', 'pita', 'flour tortilla', 'wrap', 'naan', 'english muffin', 'brioche', 'flatbread', 'pizza base'],
      de: ['toastbrot', 'toast', 'sandwichbrot', 'burgerbrotchen', 'hot dog brotchen', 'bagel', 'pitabrot', 'tortilla wraps', 'wraps', 'brioche', 'fladenbrot', 'pizzateig'],
      fr: ['pain de mie', 'pain burger', 'pain a hot dog', 'bagel', 'pain pita', 'tortilla de ble', 'wrap', 'brioche', 'pain brioche', 'pate a pizza', 'pate feuilletee', 'pate brisee'],
      it: ['pancarre', 'pan carre', 'pan bauletto', 'panino per hamburger', 'bagel', 'piadina', 'pita', 'wrap', 'brioche', 'pasta sfoglia', 'pasta brisee', 'base per pizza'],
      pt: ['pao de forma', 'pao de hamburguer', 'pao para cachorro', 'bagel', 'pao pita', 'tortilha de trigo', 'wrap', 'brioche', 'massa folhada', 'massa quebrada', 'massa de pizza'],
    },
  },
  {
    key: 'pastries', foodType: FoodType.CARB, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: null,
    source: `${FK}: commercial cakes and muffins, pantry 3-7 days (danish 5-10, doughnuts 1-2)`,
    terms: {
      es: ['croissant', 'cruasan', 'magdalena', 'bizcocho', 'donut', 'dona', 'ensaimada', 'napolitana', 'palmera', 'muffin', 'bollo', 'bolleria', 'tarta', 'pastel', 'sobao', 'caracola', 'berlina', 'churro', 'roscon', 'brownie', 'gofre', 'tortita', 'crepe', 'bollycao', 'bollito', 'cupcake', 'empanada', 'rosquilla'],
      en: ['croissant', 'muffin', 'cupcake', 'doughnut', 'donut', 'danish', 'pastry', 'cake', 'brownie', 'cinnamon roll', 'pancake', 'waffle', 'crepe', 'pie', 'scone', 'pain au chocolat'],
      de: ['croissant', 'muffin', 'donut', 'krapfen', 'berliner', 'kuchen', 'torte', 'gebaeck', 'geback', 'zimtschnecke', 'plunder', 'waffel', 'pfannkuchen', 'crepe', 'brownie', 'hefezopf'],
      fr: ['croissant', 'pain au chocolat', 'chocolatine', 'brioche au sucre', 'muffin', 'beignet', 'donut', 'gateau', 'tarte', 'madeleine', 'viennoiserie', 'crepe', 'gaufre', 'brownie', 'eclair', 'chausson aux pommes'],
      it: ['cornetto', 'croissant', 'brioche alla crema', 'muffin', 'ciambella', 'bombolone', 'torta', 'crostata', 'merendina', 'plumcake', 'crepe', 'waffle', 'brownie', 'sfogliatella', 'panettone', 'pandoro', 'colomba'],
      pt: ['croissant', 'queque', 'bolo', 'muffin', 'donut', 'bola de berlim', 'pastel de nata', 'pastel', 'tarte', 'bolo de arroz', 'crepe', 'waffle', 'brownie', 'palmier', 'bolo rei'],
    },
  },
  {
    key: 'dry-pasta', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 730, openedDays: 365, thawDays: null,
    source: `${FK}: pasta, dry, without eggs, pantry 2 years, opened 1 year`,
    terms: {
      es: ['pasta', 'macarron', 'espagueti', 'espaguetis', 'spaghetti', 'tallarin', 'fideo', 'fideua', 'helice', 'tiburon', 'maravilla', 'penne', 'plumas', 'lazo', 'pajarita', 'estrellitas', 'letras', 'concha', 'canelon', 'placas de lasana', 'lasana seca', 'cuscus', 'cous cous', 'noodles', 'fideos chinos', 'fideos de arroz', 'tagliatelle', 'fusilli', 'rigatoni', 'farfalle', 'macarrones integrales', 'pasta integral', 'sopa maravilla', 'pasta para sopa'],
      en: ['pasta', 'spaghetti', 'macaroni', 'penne', 'fusilli', 'linguine', 'fettuccine', 'tagliatelle', 'lasagna sheets', 'noodles', 'egg noodles', 'rice noodles', 'couscous', 'orzo', 'farfalle', 'rigatoni', 'ramen', 'vermicelli'],
      de: ['nudeln', 'pasta', 'spaghetti', 'makkaroni', 'penne', 'fusilli', 'spirelli', 'bandnudeln', 'tagliatelle', 'lasagneplatten', 'eiernudeln', 'spatzle', 'couscous', 'reisnudeln', 'glasnudeln', 'farfalle', 'suppennudeln'],
      fr: ['pates', 'spaghetti', 'macaroni', 'coquillettes', 'penne', 'fusilli', 'tagliatelles', 'lasagnes seches', 'nouilles', 'vermicelle', 'couscous', 'semoule', 'farfalle', 'torsades', 'coquillettes'],
      it: ['spaghetti', 'maccheroni', 'penne', 'fusilli', 'rigatoni', 'tagliatelle', 'linguine', 'farfalle', 'orecchiette', 'conchiglie', 'lasagne secche', 'cuscus', 'vermicelli', 'tortiglioni', 'mezze maniche', 'ditalini', 'bucatini', 'paccheri'],
      pt: ['massa', 'esparguete', 'macarrao', 'massa espiral', 'penne', 'fusilli', 'tagliatelle', 'lasanha seca', 'cuscuz', 'aletria', 'massinhas', 'cotovelos', 'noodles', 'massa integral', 'laco'],
    },
  },
  {
    key: 'fresh-pasta', foodType: FoodType.CARB, storage: 'fresh', sealedDays: 1, openedDays: null, thawDays: null,
    source: `${FK}: fresh pasta, fridge 1-2 days`,
    terms: {
      es: ['pasta fresca', 'tortellini', 'ravioli', 'raviolis', 'nhoqui', 'noquis', 'gnocchi', 'pasta rellena', 'cappelletti', 'tortelloni', 'girasoles'],
      en: ['fresh pasta', 'tortellini', 'ravioli', 'gnocchi', 'filled pasta', 'stuffed pasta'],
      de: ['frische pasta', 'frische nudeln', 'tortellini', 'ravioli', 'gnocchi', 'maultaschen'],
      fr: ['pates fraiches', 'tortellini', 'raviolis', 'ravioles', 'gnocchis', 'gnocchi'],
      it: ['pasta fresca', 'tortellini', 'ravioli', 'gnocchi', 'agnolotti', 'cappelletti', 'tortelloni', 'pasta ripiena'],
      pt: ['massa fresca', 'tortellini', 'ravioli', 'gnocchi', 'nhoque'],
    },
  },
  {
    key: 'rice-grains', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 365, openedDays: null, thawDays: null,
    source: `${FK}: rice, brown 1 year, white 2 years (opened 1 year); quinoa, uncooked 2-3 years`,
    terms: {
      es: ['arroz', 'arroz redondo', 'arroz largo', 'arroz basmati', 'arroz integral', 'arroz bomba', 'arroz vaporizado', 'quinoa', 'quinua', 'trigo sarraceno', 'mijo', 'cebada', 'trigo', 'trigo tierno', 'polenta', 'bulgur', 'arroz salvaje', 'espelta', 'amaranto'],
      en: ['rice', 'white rice', 'brown rice', 'basmati', 'jasmine rice', 'risotto rice', 'arborio', 'quinoa', 'buckwheat', 'millet', 'barley', 'polenta', 'bulgur', 'wild rice', 'spelt', 'grits'],
      de: ['reis', 'basmatireis', 'vollkornreis', 'risottoreis', 'milchreis trocken', 'quinoa', 'buchweizen', 'hirse', 'gerste', 'graupen', 'polenta', 'bulgur', 'dinkel', 'wildreis'],
      fr: ['riz', 'riz basmati', 'riz complet', 'riz rond', 'riz long', 'quinoa', 'sarrasin', 'millet', 'orge', 'boulgour', 'polenta', 'epeautre', 'riz sauvage'],
      it: ['riso', 'riso basmati', 'riso integrale', 'riso arborio', 'riso carnaroli', 'quinoa', 'grano saraceno', 'miglio', 'orzo perlato', 'farro', 'polenta', 'bulgur', 'riso venere'],
      pt: ['arroz', 'arroz agulha', 'arroz carolino', 'arroz basmati', 'arroz integral', 'quinoa', 'trigo sarraceno', 'milho painco', 'cevada', 'polenta', 'bulgur', 'espelta'],
    },
  },
  {
    key: 'flour', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 180, openedDays: null, thawDays: null,
    source: `${FK}: flour, white, pantry 6-12 months, opened 6-8 months; breadcrumbs 6 months; cornstarch 18-24 months`,
    terms: {
      es: ['harina', 'harina de trigo', 'harina de fuerza', 'harina integral', 'harina de maiz', 'harina de garbanzo', 'harina de almendra', 'harina de avena', 'maicena', 'fecula', 'pan rallado', 'panko', 'semola', 'rebozador', 'tempura', 'harina de reposteria'],
      en: ['flour', 'plain flour', 'all purpose flour', 'self raising flour', 'bread flour', 'whole wheat flour', 'cornflour', 'cornstarch', 'corn starch', 'breadcrumbs', 'bread crumbs', 'panko', 'semolina', 'almond flour', 'cornmeal'],
      de: ['mehl', 'weizenmehl', 'dinkelmehl', 'vollkornmehl', 'roggenmehl', 'speisestarke', 'maisstarke', 'paniermehl', 'semmelbrosel', 'griess', 'mandelmehl', 'panko'],
      fr: ['farine', 'farine de ble', 'farine complete', 'maizena', 'fecule', 'chapelure', 'panko', 'semoule fine', 'farine de mais', 'poudre d amande'],
      it: ['farina', 'farina 00', 'farina integrale', 'farina di mais', 'maizena', 'amido di mais', 'fecola', 'pangrattato', 'pan grattato', 'semola', 'panko', 'farina di mandorle'],
      pt: ['farinha', 'farinha de trigo', 'farinha integral', 'farinha de milho', 'maizena', 'amido de milho', 'pao ralado', 'panko', 'semola', 'farinha de amendoa'],
    },
  },
  {
    key: 'cookies-cereals', foodType: FoodType.CARB, storage: 'pantry', sealedDays: 60, openedDays: 30, thawDays: null,
    source: `${FK}: cookies, soft, 2-3 months (crispy 4-6); cereal, ready-to-eat, 6-12 months, opened 2-3 months; crackers 8 months, opened 1 month`,
    terms: {
      es: ['galleta', 'galletas maria', 'cereal', 'cereales', 'muesli', 'granola', 'copos de avena', 'avena', 'copos de maiz', 'corn flakes', 'tostada', 'biscote', 'pan tostado de molde', 'crackers', 'regana', 'picos', 'colines', 'palitos de pan', 'barrita de cereales', 'barrita', 'tortitas de arroz', 'tortita de maiz', 'cookies', 'oreo', 'digestive', 'galleta salada', 'grisines', 'cereales de desayuno'],
      en: ['cookie', 'biscuit', 'cracker', 'cereal', 'breakfast cereal', 'cornflakes', 'corn flakes', 'muesli', 'granola', 'oats', 'oatmeal', 'porridge oats', 'rice cakes', 'cereal bar', 'granola bar', 'breadsticks', 'crispbread', 'rusks', 'graham crackers', 'digestives'],
      de: ['kekse', 'keks', 'platzchen', 'cracker', 'cornflakes', 'musli', 'muesli', 'granola', 'haferflocken', 'zwieback', 'knackebrot', 'reiswaffeln', 'getreideriegel', 'muesliriegel', 'salzstangen', 'grissini', 'frühstuckscerealien', 'cerealien'],
      fr: ['biscuit', 'biscuits', 'gateaux secs', 'cereales', 'corn flakes', 'muesli', 'granola', 'flocons d avoine', 'biscottes', 'crackers', 'galettes de riz', 'barre de cereales', 'gressins', 'pain grille', 'sables', 'petit beurre'],
      it: ['biscotti', 'biscotto', 'cereali', 'corn flakes', 'muesli', 'granola', 'fiocchi d avena', 'avena', 'fette biscottate', 'cracker', 'crackers', 'gallette di riso', 'barretta ai cereali', 'grissini', 'taralli', 'frollini'],
      pt: ['bolacha', 'bolachas', 'biscoito', 'cereais', 'corn flakes', 'muesli', 'granola', 'flocos de aveia', 'aveia', 'tostas', 'crackers', 'bolachas de arroz', 'barra de cereais', 'grissinis', 'bolacha maria'],
    },
  },
];

const VEGETABLE_CLASSES: readonly FoodClass[] = [
  {
    key: 'leafy-greens', foodType: FoodType.VEGETABLE, storage: 'fresh', sealedDays: 3, openedDays: 2, thawDays: null,
    source: `${FK}: lettuce, leaf, and spinach, fridge 3-7 days; bagged greens 3-5 days, opened 2 days`,
    terms: {
      es: ['lechuga', 'espinaca', 'rucula', 'canonigo', 'ensalada', 'mezclum', 'brotes tiernos', 'acelga', 'kale', 'col rizada', 'escarola', 'endibia', 'cogollo', 'berro', 'perejil', 'cilantro', 'albahaca fresca', 'hierbabuena', 'menta fresca', 'eneldo', 'cebollino', 'lechuga iceberg', 'lechuga romana', 'bolsa de ensalada', 'germinados', 'brotes de soja', 'grelos'],
      en: ['lettuce', 'spinach', 'baby spinach', 'arugula', 'rocket', 'salad', 'mixed greens', 'salad leaves', 'kale', 'chard', 'swiss chard', 'romaine', 'iceberg', 'watercress', 'parsley', 'cilantro', 'coriander', 'fresh basil', 'mint', 'dill', 'chives', 'bean sprouts', 'bok choy', 'endive'],
      de: ['salat', 'kopfsalat', 'eisbergsalat', 'spinat', 'blattspinat', 'rucola', 'feldsalat', 'mangold', 'grunkohl', 'kale', 'endivie', 'chicoree', 'kresse', 'petersilie', 'koriander', 'basilikum', 'minze', 'dill', 'schnittlauch', 'pak choi', 'sprossen'],
      fr: ['salade', 'laitue', 'epinard', 'epinards', 'roquette', 'mache', 'mesclun', 'blette', 'chou kale', 'endive', 'cresson', 'persil', 'coriandre', 'basilic', 'menthe', 'aneth', 'ciboulette', 'batavia', 'frisee', 'pousses'],
      it: ['lattuga', 'insalata', 'spinaci', 'rucola', 'valeriana', 'songino', 'bietola', 'bietole', 'cavolo nero', 'indivia', 'scarola', 'radicchio', 'crescione', 'prezzemolo', 'coriandolo', 'basilico', 'menta', 'aneto', 'erba cipollina', 'germogli'],
      pt: ['alface', 'espinafre', 'espinafres', 'rucula', 'agriao', 'canonigos', 'salada', 'acelga', 'couve kale', 'endivia', 'salsa fresca', 'coentros', 'manjericao', 'hortela', 'endro', 'cebolinho', 'rebentos', 'grelos'],
    },
  },
  {
    key: 'fruiting-veg', foodType: FoodType.VEGETABLE, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: null,
    source: `${FK}: green beans, broccoli, cauliflower, asparagus 3-5 days; mushrooms 3-7; peppers 4-14; cucumbers 4-6; zucchini 4-5; eggplant 4-7; tomatoes ripe, then 7 days`,
    terms: {
      es: ['tomate', 'tomates', 'tomate cherry', 'cherry', 'tomate pera', 'tomate rama', 'pimiento', 'pimiento rojo', 'pimiento verde', 'pimiento italiano', 'pimiento de padron', 'guindilla fresca', 'calabacin', 'berenjena', 'pepino', 'judia verde', 'judias verdes', 'vainas', 'brocoli', 'brecol', 'coliflor', 'romanesco', 'champinon', 'seta', 'hongo', 'esparrago', 'esparrago verde', 'alcachofa', 'mazorca', 'maiz en mazorca', 'guisante fresco', 'haba fresca', 'okra', 'pomodorino', 'jalapeno'],
      // Bare "pepper" is the vegetable, the one that lasts less; the spice is "black pepper".
      en: ['tomato', 'tomatoes', 'cherry tomato', 'pepper', 'bell pepper', 'red pepper', 'green pepper', 'chili pepper', 'jalapeno', 'zucchini', 'courgette', 'eggplant', 'aubergine', 'cucumber', 'green bean', 'string bean', 'broccoli', 'cauliflower', 'mushroom', 'asparagus', 'artichoke', 'corn on the cob', 'sweet corn cob', 'okra', 'snap peas', 'snow peas'],
      // German "Paprika" is the vegetable; the spice is "Paprikapulver".
      de: ['tomate', 'tomaten', 'kirschtomaten', 'cocktailtomaten', 'paprika', 'chili', 'zucchini', 'aubergine', 'gurke', 'salatgurke', 'grune bohnen', 'brechbohnen', 'brokkoli', 'blumenkohl', 'champignons', 'pilze', 'spargel', 'artischocke', 'maiskolben', 'zuckerschoten'],
      fr: ['tomate', 'tomates cerises', 'poivron', 'piment', 'courgette', 'aubergine', 'concombre', 'haricot vert', 'haricots verts', 'brocoli', 'chou fleur', 'champignon', 'champignons de paris', 'asperge', 'artichaut', 'epi de mais', 'pois gourmands', 'gombo'],
      it: ['pomodoro', 'pomodori', 'pomodorini', 'pomodoro ciliegino', 'peperone', 'peperoni', 'peperoncino fresco', 'zucchina', 'zucchine', 'melanzana', 'melanzane', 'cetriolo', 'cetrioli', 'fagiolini', 'broccoli', 'cavolfiore', 'funghi', 'champignon', 'asparagi', 'carciofo', 'carciofi', 'pannocchia', 'taccole'],
      pt: ['tomate', 'tomate cereja', 'pimento', 'pimentos', 'pimentao', 'malagueta fresca', 'curgete', 'courgette', 'abobrinha', 'beringela', 'pepino', 'feijao verde', 'vagem', 'brocolos', 'couve flor', 'cogumelo', 'cogumelos', 'espargo', 'espargos', 'alcachofra', 'maçaroca', 'macaroca', 'ervilha torta'],
    },
  },
  {
    key: 'hardy-veg', foodType: FoodType.VEGETABLE, storage: 'fresh', sealedDays: 7, openedDays: null, thawDays: null,
    source: `${FK}: cabbage, celery, leeks, beets 1-2 weeks; radishes 10-14 days; carrots 2-3 weeks; sweet potatoes 2-3 weeks; winter squash 2-6 weeks (pantry)`,
    terms: {
      es: ['zanahoria', 'col', 'repollo', 'lombarda', 'coles de bruselas', 'col de bruselas', 'apio', 'puerro', 'remolacha', 'rabano', 'nabo', 'chirivia', 'calabaza', 'boniato', 'jengibre', 'hinojo', 'colinabo', 'yuca', 'zanahorias baby'],
      en: ['carrot', 'cabbage', 'red cabbage', 'brussels sprout', 'celery', 'leek', 'beetroot', 'beet', 'radish', 'turnip', 'parsnip', 'pumpkin', 'butternut squash', 'squash', 'sweet potato', 'yam', 'ginger', 'fennel', 'celeriac', 'kohlrabi', 'cassava', 'swede', 'rutabaga'],
      de: ['karotte', 'karotten', 'mohre', 'mohren', 'kohl', 'weisskohl', 'rotkohl', 'wirsing', 'rosenkohl', 'sellerie', 'staudensellerie', 'lauch', 'porree', 'rote bete', 'radieschen', 'rettich', 'pastinake', 'kurbis', 'susskartoffel', 'ingwer', 'fenchel', 'kohlrabi', 'steckrube'],
      fr: ['carotte', 'chou', 'chou rouge', 'chou de bruxelles', 'celeri', 'poireau', 'betterave', 'radis', 'navet', 'panais', 'potiron', 'citrouille', 'courge', 'butternut', 'patate douce', 'gingembre', 'fenouil', 'celeri rave', 'chou rave', 'manioc'],
      it: ['carota', 'carote', 'cavolo', 'cavolo cappuccio', 'cavolo rosso', 'cavolini di bruxelles', 'verza', 'sedano', 'porro', 'porri', 'barbabietola', 'ravanello', 'ravanelli', 'rapa', 'pastinaca', 'zucca', 'patata dolce', 'patata americana', 'zenzero', 'finocchio', 'finocchi', 'sedano rapa'],
      pt: ['cenoura', 'couve', 'repolho', 'couve roxa', 'couve de bruxelas', 'aipo', 'alho frances', 'alho porro', 'beterraba', 'rabanete', 'nabo', 'pastinaga', 'abobora', 'batata doce', 'gengibre', 'funcho', 'erva doce', 'aipo rabano', 'mandioca', 'couve lombarda'],
    },
  },
  {
    key: 'bulbs-tubers', foodType: FoodType.VEGETABLE, storage: 'fresh', sealedDays: 30, openedDays: null, thawDays: null,
    source: `${FK}: potatoes, pantry 1-2 months; onions (yellow, white, red), pantry 1 month; garlic, pantry 1 month`,
    terms: {
      es: ['patata', 'papa', 'patatas nuevas', 'patata para freir', 'cebolla', 'cebolla morada', 'cebolla roja', 'cebolleta', 'chalota', 'ajo', 'cabeza de ajo', 'ajo morado', 'cebollino tierno'],
      en: ['potato', 'potatoes', 'baby potatoes', 'new potatoes', 'onion', 'red onion', 'white onion', 'yellow onion', 'spring onion', 'scallion', 'green onion', 'shallot', 'garlic', 'garlic bulb'],
      de: ['kartoffel', 'kartoffeln', 'frühkartoffeln', 'zwiebel', 'zwiebeln', 'rote zwiebel', 'rote zwiebeln', 'fruhlingszwiebel', 'fruhlingszwiebeln', 'schalotte', 'schalotten', 'knoblauch', 'knoblauchzehe'],
      fr: ['pomme de terre', 'pommes de terre', 'patate', 'grenaille', 'oignon', 'oignon rouge', 'oignon blanc', 'oignon nouveau', 'echalote', 'ail', 'gousse d ail', 'tete d ail'],
      it: ['patata', 'patate', 'patate novelle', 'cipolla', 'cipolle', 'cipolla rossa', 'cipollotto', 'scalogno', 'aglio', 'spicchio d aglio'],
      // In Portugal "batata" is the potato (in Spain it would be the sweet potato).
      pt: ['batata', 'batatas', 'batata nova', 'cebola', 'cebolas', 'cebola roxa', 'cebolinha', 'chalota', 'alho', 'cabeca de alho', 'dente de alho'],
    },
  },
  {
    key: 'frozen-veg', foodType: FoodType.VEGETABLE, storage: 'pantry', sealedDays: 300, openedDays: null, thawDays: null,
    source: `${FK}: vegetables purchased frozen, freezer 10-18 months; cooked after thawing 3-4 days (THAW_MAX_DAYS)`,
    terms: {
      es: ['guisante congelado', 'guisantes congelados', 'verdura congelada', 'verduras congeladas', 'brocoli congelado', 'espinaca congelada', 'judia verde congelada', 'menestra', 'salteado de verduras', 'patatas congeladas', 'patata prefrita', 'patatas prefritas', 'coliflor congelada', 'maiz congelado', 'wok de verduras', 'parrillada de verduras congelada', 'ajo congelado', 'cebolla congelada'],
      en: ['frozen peas', 'frozen pea', 'frozen vegetable', 'frozen veg', 'frozen broccoli', 'frozen spinach', 'frozen corn', 'mixed vegetables', 'frozen fries', 'oven chips', 'french fries', 'hash browns', 'tater tots', 'stir fry vegetables', 'frozen green beans'],
      de: ['tk erbsen', 'tiefkuhlerbsen', 'tiefkuhlgemuse', 'tk gemuse', 'tk spinat', 'tk brokkoli', 'pommes frites', 'kroketten tk', 'rahmspinat', 'erbsen tk', 'gemusemischung'],
      fr: ['petits pois surgeles', 'legumes surgeles', 'epinards surgeles', 'haricots verts surgeles', 'brocolis surgeles', 'frites surgelees', 'poelee de legumes', 'jardiniere de legumes'],
      it: ['piselli surgelati', 'verdure surgelate', 'spinaci surgelati', 'minestrone surgelato', 'patatine surgelate', 'patatine fritte surgelate', 'fagiolini surgelati', 'misto per soffritto'],
      pt: ['ervilhas congeladas', 'legumes congelados', 'espinafres congelados', 'brocolos congelados', 'batata frita congelada', 'batatas fritas congeladas', 'jardineira de legumes', 'salteado de legumes'],
    },
  },
];

const FRUIT_CLASSES: readonly FoodClass[] = [
  {
    key: 'soft-fruit', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 2, openedDays: null, thawDays: null,
    source: `${FK}: strawberries, raspberries, cherries, fridge 2-3 days (blueberries 1-2 weeks)`,
    terms: {
      es: ['fresa', 'freson', 'frambuesa', 'mora', 'arandano', 'cereza', 'picota', 'grosella', 'frutos del bosque', 'frutos rojos', 'higo', 'breva'],
      en: ['strawberry', 'strawberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries', 'blueberry', 'blueberries', 'cherries', 'berries', 'mixed berries', 'redcurrant', 'gooseberry', 'fig', 'figs'],
      de: ['erdbeere', 'erdbeeren', 'himbeere', 'himbeeren', 'brombeere', 'brombeeren', 'heidelbeere', 'heidelbeeren', 'blaubeeren', 'kirsche', 'kirschen', 'johannisbeeren', 'beeren', 'feige', 'feigen'],
      fr: ['fraise', 'framboise', 'mure', 'myrtille', 'cerise', 'groseille', 'fruits rouges', 'figue', 'cassis'],
      it: ['fragola', 'fragole', 'lampone', 'lamponi', 'mora', 'mirtillo', 'mirtilli', 'ciliegia', 'ciliegie', 'ribes', 'frutti di bosco', 'fico', 'fichi'],
      pt: ['morango', 'framboesa', 'amora', 'mirtilo', 'cereja', 'groselha', 'frutos vermelhos', 'frutos silvestres', 'figo'],
    },
  },
  {
    key: 'common-fruit', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: null,
    source: `${FK}: bananas 3 days; avocados 3-4; peaches, nectarines, plums, pears 3-5; kiwi 3-6; papaya, mango 3-5 (pantry); pineapple 5-7; grapes 1 week`,
    terms: {
      es: ['platano', 'banana', 'platano de canarias', 'aguacate', 'melocoton', 'nectarina', 'paraguayo', 'ciruela', 'albaricoque', 'pera', 'kiwi', 'mango', 'papaya', 'pina', 'uva', 'granada', 'caqui', 'chirimoya', 'maracuya', 'lichi', 'guayaba', 'coco', 'pitahaya', 'nispero', 'fruta'],
      en: ['banana', 'avocado', 'peach', 'nectarine', 'plum', 'apricot', 'pear', 'kiwi', 'mango', 'papaya', 'pineapple', 'grape', 'pomegranate', 'persimmon', 'passion fruit', 'lychee', 'guava', 'coconut', 'dragon fruit', 'fruit'],
      de: ['banane', 'bananen', 'avocado', 'avocados', 'pfirsich', 'pfirsiche', 'nektarine', 'nektarinen', 'pflaume', 'pflaumen', 'zwetschgen', 'aprikose', 'aprikosen', 'birne', 'birnen', 'kiwi', 'mango', 'papaya', 'ananas', 'weintrauben', 'trauben', 'granatapfel', 'kaki', 'maracuja', 'kokosnuss', 'obst'],
      fr: ['banane', 'avocat', 'peche', 'nectarine', 'brugnon', 'prune', 'abricot', 'poire', 'kiwi', 'mangue', 'papaye', 'ananas', 'raisin', 'grenade', 'kaki', 'fruit de la passion', 'litchi', 'noix de coco', 'fruits'],
      it: ['banana', 'banane', 'avocado', 'pesca', 'pesche', 'nettarina', 'prugna', 'susina', 'albicocca', 'albicocche', 'pera', 'pere', 'kiwi', 'mango', 'papaia', 'ananas', 'uva', 'melagrana', 'cachi', 'frutto della passione', 'litchi', 'cocco', 'frutta'],
      pt: ['banana', 'abacate', 'pessego', 'nectarina', 'ameixa', 'damasco', 'alperce', 'pera', 'kiwi', 'manga', 'papaia', 'ananas', 'abacaxi', 'uva', 'uvas', 'diospiro', 'maracuja', 'lichia', 'goiaba', 'coco', 'fruta'],
    },
  },
  {
    key: 'hardy-fruit', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 21, openedDays: null, thawDays: null,
    source: `${FK}: apples, pantry 3 weeks, fridge 4-6 weeks`,
    terms: {
      es: ['manzana', 'manzana golden', 'manzana fuji', 'manzana reineta', 'manzana gala', 'manzana granny smith', 'membrillo fruta'],
      en: ['apple', 'apples', 'gala apple', 'granny smith', 'pink lady', 'fuji apple', 'golden delicious', 'braeburn'],
      de: ['apfel', 'apfel elstar', 'apfel gala', 'aepfel', 'boskop', 'granny smith', 'pink lady'],
      fr: ['pomme', 'pommes', 'pomme golden', 'pomme gala', 'granny smith', 'pink lady', 'reinette'],
      it: ['mela', 'mele', 'mela golden', 'mela fuji', 'mela renetta', 'granny smith', 'pink lady'],
      pt: ['maca', 'macas', 'maca golden', 'maca gala', 'maca reineta', 'maca fuji', 'pink lady'],
    },
  },
  {
    key: 'citrus', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 10, openedDays: null, thawDays: null,
    source: `${FK}: citrus fruit (lemon, lime, orange, grapefruit, tangerines, clementines), pantry 10 days, fridge 10-21 days`,
    terms: {
      es: ['naranja', 'naranja de zumo', 'limon', 'lima', 'mandarina', 'clementina', 'pomelo', 'kumquat', 'naranja sanguina'],
      en: ['orange', 'lemon', 'lime', 'tangerine', 'mandarin', 'clementine', 'satsuma', 'grapefruit', 'kumquat', 'blood orange'],
      de: ['orange', 'orangen', 'apfelsine', 'zitrone', 'zitronen', 'limette', 'limetten', 'mandarine', 'mandarinen', 'clementine', 'clementinen', 'grapefruit', 'pampelmuse'],
      fr: ['orange', 'citron', 'citron vert', 'mandarine', 'clementine', 'pamplemousse', 'kumquat'],
      it: ['arancia', 'arance', 'limone', 'limoni', 'lime', 'mandarino', 'mandarini', 'clementina', 'clementine', 'pompelmo'],
      pt: ['laranja', 'limao', 'lima', 'tangerina', 'clementina', 'mandarina', 'toranja', 'kumquat'],
    },
  },
  {
    key: 'melon', foodType: FoodType.FRUIT, storage: 'fresh', sealedDays: 3, openedDays: 2, thawDays: null,
    source: `${FK}: watermelon and honeydew, fridge 3-4 days; melons, cut, 2-4 days`,
    terms: {
      es: ['melon', 'sandia', 'melon cantalupo', 'melon piel de sapo', 'melon galia'],
      en: ['melon', 'watermelon', 'cantaloupe', 'honeydew', 'galia melon'],
      de: ['melone', 'wassermelone', 'honigmelone', 'cantaloupe', 'galiamelone'],
      fr: ['melon', 'pasteque', 'melon charentais', 'melon jaune'],
      it: ['melone', 'anguria', 'cocomero', 'melone cantalupo'],
      pt: ['melao', 'melancia', 'meloa', 'melao branco'],
    },
  },
  {
    key: 'dried-fruit', foodType: FoodType.FRUIT, storage: 'pantry', sealedDays: 60, openedDays: 30, thawDays: null,
    source: `${FK}: dates, pantry 2 months; dried fruits (raisins, apricots, mangoes, cranberries), pantry 6 months, opened 1 month`,
    terms: {
      es: ['datil', 'pasa', 'uva pasa', 'orejon', 'ciruela pasa', 'higo seco', 'fruta deshidratada', 'arandano rojo seco', 'mango deshidratado', 'platano deshidratado', 'fruta desecada'],
      en: ['dates', 'date', 'sultana', 'raisins', 'dried apricot', 'dried plum', 'dried fig', 'dried fruit', 'dried cranberry', 'dried mango'],
      de: ['datteln', 'rosinen', 'sultaninen', 'getrocknete aprikosen', 'trockenpflaumen', 'getrocknete feigen', 'trockenobst', 'cranberries getrocknet'],
      fr: ['datte', 'raisin sec', 'raisins secs', 'abricot sec', 'pruneau', 'figue seche', 'fruits secs', 'cranberries sechees'],
      it: ['datteri', 'dattero', 'uvetta', 'uva passa', 'albicocche secche', 'prugne secche', 'fichi secchi', 'frutta secca disidratata', 'mirtilli rossi secchi'],
      pt: ['tamara', 'tamaras', 'passa', 'uva passa', 'alperce seco', 'ameixa seca', 'figo seco', 'fruta desidratada', 'fruta cristalizada'],
    },
  },
  {
    key: 'frozen-fruit', foodType: FoodType.FRUIT, storage: 'pantry', sealedDays: 300, openedDays: null, thawDays: null,
    source: `${FK}: fruits purchased frozen (berries, melons), freezer 10-18 months`,
    terms: {
      es: ['fruta congelada', 'fresa congelada', 'fresas congeladas', 'frutos rojos congelados', 'frutos del bosque congelados', 'mango congelado', 'arandanos congelados'],
      en: ['frozen fruit', 'frozen berries', 'frozen strawberries', 'frozen mango', 'frozen blueberries', 'frozen raspberries'],
      de: ['tk beeren', 'tk obst', 'tiefkuhlobst', 'gefrorene beeren', 'tk erdbeeren', 'tk himbeeren'],
      fr: ['fruits surgeles', 'fruits rouges surgeles', 'fraises surgelees', 'mangue surgelee', 'framboises surgelees'],
      it: ['frutta surgelata', 'frutti di bosco surgelati', 'fragole surgelate', 'mango surgelato', 'mirtilli surgelati'],
      pt: ['fruta congelada', 'frutos vermelhos congelados', 'morangos congelados', 'manga congelada', 'frutos silvestres congelados'],
    },
  },
];

const NON_PERISHABLE_CLASSES: readonly FoodClass[] = [
  {
    key: 'canned', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: 3, thawDays: null,
    source: `${FK}: canned goods, high acid, 12-18 months, opened 5-7 days; low acid (meat, fish, beans), 2-5 years, opened 3-4 days; canned evaporated or condensed milk 12 months, opened 4-5 days`,
    terms: {
      // Plain "atún" (and "maíz") is the tin in Spain; fresh cuts are in fresh-fish.
      es: ['conserva', 'lata', 'atun', 'atun claro', 'atun en aceite', 'atun al natural', 'bonito del norte', 'sardina en aceite', 'sardinilla', 'caballa en aceite', 'melva', 'anchoa', 'berberecho en lata', 'mejillon en escabeche', 'mejillon escabeche', 'escabeche', 'calamar en su tinta', 'calamar en tinta', 'pulpo en lata', 'maiz', 'maiz dulce', 'garbanzo cocido', 'garbanzos cocidos', 'lenteja cocida', 'alubia cocida', 'judias cocidas', 'legumbres cocidas', 'pimiento asado', 'pimientos asados', 'pimiento del piquillo', 'piquillo', 'champinon en lata', 'champinon lata', 'esparrago en lata', 'esparrago blanco', 'alcachofa en conserva', 'tomate triturado', 'tomate natural', 'tomate pelado', 'tomate entero', 'fabada', 'cocido', 'callos', 'pisto', 'remolacha cocida', 'leche condensada', 'leche evaporada', 'fruta en almibar', 'melocoton en almibar', 'pina en almibar', 'carne en lata', 'albondigas en salsa', 'macedonia en lata'],
      en: ['canned', 'tinned', 'canned tuna', 'tuna', 'canned salmon', 'canned sardines', 'sardines in oil', 'anchovies', 'anchovy', 'sweetcorn', 'canned corn', 'canned beans', 'baked beans', 'kidney beans canned', 'canned chickpeas', 'canned tomatoes', 'chopped tomatoes', 'tomato puree', 'tomato paste', 'canned peaches', 'canned fruit', 'condensed milk', 'evaporated milk', 'spam', 'corned beef', 'canned soup'],
      de: ['konserve', 'dose', 'dosen', 'thunfisch', 'sardinen', 'olsardinen', 'sardellen', 'mais', 'kidneybohnen', 'baked beans', 'kichererbsen dose', 'dosentomaten', 'gehackte tomaten', 'tomatenmark', 'pfirsiche dose', 'kondensmilch', 'eintopf', 'ravioli dose'],
      fr: ['conserve', 'boite', 'thon', 'thon en boite', 'sardines', 'sardines a l huile', 'anchois', 'mais', 'haricots rouges', 'flageolets', 'pois chiches en boite', 'tomates pelees', 'tomates concassees', 'concentre de tomate', 'lait concentre', 'cassoulet', 'peches au sirop', 'macedoine'],
      it: ['scatoletta', 'in scatola', 'tonno', 'tonno in scatola', 'acciughe', 'alici', 'mais', 'fagioli in scatola', 'ceci in scatola', 'pelati', 'polpa di pomodoro', 'pomodori pelati', 'concentrato di pomodoro', 'latte condensato', 'pesche sciroppate', 'carne in scatola', 'simmenthal'],
      pt: ['conserva', 'lata', 'atum', 'atum em lata', 'sardinhas em lata', 'sardinha em azeite', 'cavala em lata', 'anchovas', 'milho', 'milho doce', 'feijao cozido', 'grao cozido', 'tomate pelado', 'polpa de tomate', 'concentrado de tomate', 'leite condensado', 'leite evaporado', 'pessego em calda', 'ananas em calda', 'feijoada enlatada', 'salsichas em lata'],
    },
  },
  {
    key: 'pasta-sauce', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 180, openedDays: 3, thawDays: null, preparation: true,
    source: `${FK}: spaghetti sauce in jars, pantry 18 months, opened 4 days; tomato sauce opened 3-5 days; pesto, jarred, fridge 6 months, opened 3 days`,
    terms: {
      es: ['tomate frito', 'salsa de tomate', 'salsa tomate', 'salsa bolonesa', 'bolonesa', 'salsa pesto', 'pesto', 'salsa carbonara', 'carbonara', 'salsa napolitana', 'salsa arrabbiata', 'salsa cuatro quesos', 'salsa para pasta', 'sofrito', 'salsa de setas', 'salsa bechamel', 'bechamel', 'salsa de queso', 'salsa pizza', 'tomate frito casero', 'passata'],
      en: ['pasta sauce', 'tomato sauce', 'marinara', 'bolognese', 'bolognese sauce', 'pesto', 'carbonara sauce', 'arrabbiata', 'pizza sauce', 'alfredo sauce', 'white sauce', 'bechamel', 'cheese sauce', 'passata'],
      de: ['tomatensauce', 'tomatensosse', 'nudelsauce', 'pastasauce', 'bolognese', 'pesto', 'carbonara sauce', 'arrabbiata', 'pizzasauce', 'bechamelsauce', 'kasesauce', 'passata'],
      fr: ['sauce tomate', 'sauce bolognaise', 'bolognaise', 'pesto', 'sauce carbonara', 'sauce arrabbiata', 'sauce pizza', 'sauce pour pates', 'bechamel', 'coulis de tomate', 'tomate concassee', 'passata'],
      it: ['passata', 'passata di pomodoro', 'sugo', 'sugo di pomodoro', 'salsa di pomodoro', 'ragu', 'pesto', 'pesto alla genovese', 'sugo all arrabbiata', 'besciamella', 'sugo pronto', 'salsa per pizza'],
      pt: ['tomate frito', 'molho de tomate', 'molho bolonhesa', 'pesto', 'molho carbonara', 'molho para massa', 'molho bechamel', 'bechamel', 'molho de queijo', 'molho pizza', 'polpa de tomate pronta', 'passata'],
    },
  },
  {
    key: 'pickles-olives', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: 14, thawDays: null,
    source: `${FK}: olives, black and green, pantry 12-18 months, opened 2 weeks; pickles 1 year, opened 1-3 months`,
    terms: {
      es: ['aceituna', 'olivas', 'aceitunas alinadas', 'aceituna rellena', 'aceituna negra', 'pepinillo', 'encurtido', 'banderilla', 'alcaparra', 'cebollita encurtida', 'guindilla en vinagre', 'altramuz', 'chucrut', 'piparra', 'berenjena de almagro', 'aceituna anchoa', 'aceituna con anchoa'],
      en: ['olive', 'olives', 'green olives', 'black olives', 'pickle', 'gherkin', 'pickled onions', 'capers', 'sauerkraut', 'pickled jalapenos', 'relish', 'kimchi'],
      de: ['oliven', 'gewurzgurken', 'essiggurken', 'cornichons', 'kapern', 'sauerkraut', 'silberzwiebeln', 'peperoni eingelegt', 'mixed pickles'],
      fr: ['olive', 'olives', 'olives vertes', 'olives noires', 'cornichon', 'cornichons', 'capres', 'choucroute', 'oignons au vinaigre', 'pickles'],
      it: ['olive', 'olive verdi', 'olive nere', 'cetriolini', 'sottaceti', 'capperi', 'crauti', 'cipolline sottaceto', 'giardiniera', 'lupini'],
      pt: ['azeitona', 'azeitonas', 'pickles', 'pepino em vinagre', 'alcaparras', 'chucrute', 'tremocos', 'cebolinhas em vinagre'],
    },
  },
  {
    key: 'jam-spreads', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 180, openedDays: 60, thawDays: null, preparation: true,
    source: `${FK}: jams, jellies and preserves, pantry 6-18 months, opened 6-12 months; peanut butter, pantry 6-24 months, opened 2-3 months; honey 2 years`,
    terms: {
      es: ['mermelada', 'confitura', 'compota', 'miel', 'sirope', 'sirope de arce', 'crema de cacao', 'nocilla', 'nutella', 'crema de cacahuete', 'mantequilla de cacahuete', 'crema de avellana', 'dulce de leche', 'dulce de membrillo', 'membrillo', 'melaza', 'tahini', 'crema de almendra'],
      en: ['jam', 'jelly', 'marmalade', 'preserves', 'fruit spread', 'honey', 'maple syrup', 'syrup', 'peanut butter', 'almond butter', 'nutella', 'chocolate spread', 'hazelnut spread', 'dulce de leche', 'molasses', 'tahini', 'golden syrup', 'applesauce'],
      de: ['marmelade', 'konfiture', 'gelee', 'fruchtaufstrich', 'honig', 'ahornsirup', 'sirup', 'erdnussbutter', 'nutella', 'nuss nougat creme', 'schokoaufstrich', 'mandelmus', 'apfelmus', 'tahin', 'rubenkraut'],
      fr: ['confiture', 'gelee', 'marmelade', 'compote', 'miel', 'sirop d erable', 'sirop', 'beurre de cacahuete', 'pate a tartiner', 'nutella', 'creme de marrons', 'confiture de lait', 'tahini', 'puree d amande'],
      it: ['marmellata', 'confettura', 'gelatina di frutta', 'miele', 'sciroppo d acero', 'sciroppo', 'burro di arachidi', 'crema spalmabile', 'nutella', 'crema di nocciole', 'composta', 'tahina', 'mostarda di frutta'],
      pt: ['compota', 'doce de fruta', 'geleia', 'marmelada', 'mel', 'xarope de acer', 'xarope', 'manteiga de amendoim', 'creme de barrar', 'nutella', 'creme de avela', 'doce de leite', 'tahini', 'pure de maca'],
    },
  },
  {
    key: 'oil', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 180, openedDays: 90, thawDays: null,
    source: `${FK}: oils, olive or vegetable, pantry 6-12 months, opened 3-5 months`,
    terms: {
      es: ['aceite', 'aceite de oliva', 'aceite de oliva virgen extra', 'aove', 'aceite de girasol', 'aceite de semillas', 'aceite de coco', 'aceite de sesamo', 'aceite vegetal', 'aceite de orujo', 'spray de aceite'],
      en: ['oil', 'olive oil', 'extra virgin olive oil', 'sunflower oil', 'vegetable oil', 'canola oil', 'rapeseed oil', 'coconut oil', 'sesame oil', 'avocado oil', 'cooking spray'],
      de: ['ol', 'olivenol', 'sonnenblumenol', 'rapsol', 'pflanzenol', 'kokosol', 'sesamol', 'speiseol', 'bratol'],
      fr: ['huile', 'huile d olive', 'huile de tournesol', 'huile de colza', 'huile vegetale', 'huile de coco', 'huile de sesame', 'huile de friture'],
      it: ['olio', 'olio d oliva', 'olio extravergine', 'olio evo', 'olio di semi', 'olio di girasole', 'olio di arachidi', 'olio di cocco', 'olio di sesamo'],
      pt: ['azeite', 'azeite virgem extra', 'oleo', 'oleo de girassol', 'oleo vegetal', 'oleo de coco', 'oleo de sesamo', 'oleo alimentar'],
    },
  },
  {
    key: 'salt-spices', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: null, openedDays: null, thawDays: null,
    source: `${FK}: salt and apple cider vinegar keep indefinitely; sugar has no unopened limit (opened 18-24 months); spices 2-4 years are quality only. Spec: no expiry`,
    terms: {
      es: ['sal', 'sal gorda', 'sal fina', 'sal marina', 'sal en escamas', 'sal yodada', 'azucar', 'azucar moreno', 'azucar glas', 'azucar blanco', 'panela', 'edulcorante', 'sacarina', 'stevia', 'vinagre', 'vinagre de vino', 'vinagre de manzana', 'vinagre balsamico', 'vinagre de jerez', 'pimienta', 'pimienta negra', 'pimienta blanca', 'especia', 'especias', 'oregano', 'pimenton', 'pimenton de la vera', 'comino', 'canela', 'curry', 'curcuma', 'nuez moscada', 'laurel', 'tomillo', 'romero', 'ajo en polvo', 'cebolla en polvo', 'guindilla', 'cayena', 'perejil seco', 'albahaca seca', 'colorante', 'azafran', 'clavo', 'jengibre molido', 'hierbas provenzales', 'sazonador', 'avecrem en polvo', 'vainilla', 'esencia de vainilla', 'anis', 'sesamo tostado'],
      en: ['salt', 'sea salt', 'table salt', 'kosher salt', 'sugar', 'brown sugar', 'icing sugar', 'caster sugar', 'powdered sugar', 'sweetener', 'stevia', 'vinegar', 'balsamic vinegar', 'apple cider vinegar', 'wine vinegar', 'black pepper', 'white pepper', 'peppercorns', 'spice', 'spices', 'oregano', 'paprika powder', 'smoked paprika', 'cumin', 'cinnamon', 'curry powder', 'turmeric', 'nutmeg', 'bay leaves', 'thyme', 'rosemary', 'garlic powder', 'onion powder', 'chili flakes', 'cayenne', 'dried herbs', 'saffron', 'cloves', 'vanilla extract', 'seasoning'],
      de: ['salz', 'meersalz', 'jodsalz', 'zucker', 'brauner zucker', 'puderzucker', 'rohrzucker', 'sussstoff', 'essig', 'balsamico', 'apfelessig', 'weinessig', 'pfeffer', 'schwarzer pfeffer', 'gewurz', 'gewurze', 'oregano', 'paprikapulver', 'kreuzkummel', 'zimt', 'curry', 'kurkuma', 'muskat', 'lorbeer', 'thymian', 'rosmarin', 'knoblauchpulver', 'chiliflocken', 'safran', 'vanille', 'vanillezucker'],
      fr: ['sel', 'gros sel', 'sel fin', 'fleur de sel', 'sucre', 'sucre roux', 'sucre glace', 'sucre en poudre', 'cassonade', 'edulcorant', 'vinaigre', 'vinaigre balsamique', 'vinaigre de cidre', 'vinaigre de vin', 'poivre', 'poivre noir', 'epice', 'epices', 'origan', 'cumin', 'cannelle', 'curcuma', 'muscade', 'laurier', 'thym', 'romarin', 'ail en poudre', 'piment d espelette', 'herbes de provence', 'safran', 'clou de girofle', 'vanille', 'sucre vanille'],
      it: ['sale', 'sale grosso', 'sale fino', 'sale marino', 'zucchero', 'zucchero di canna', 'zucchero a velo', 'dolcificante', 'aceto', 'aceto balsamico', 'aceto di mele', 'aceto di vino', 'pepe', 'pepe nero', 'spezie', 'spezia', 'origano', 'paprika dolce', 'cumino', 'cannella', 'curcuma', 'noce moscata', 'alloro', 'timo', 'rosmarino', 'aglio in polvere', 'peperoncino', 'zafferano', 'chiodi di garofano', 'vaniglia', 'vanillina'],
      pt: ['sal', 'sal grosso', 'sal fino', 'flor de sal', 'acucar', 'acucar mascavado', 'acucar amarelo', 'acucar em po', 'adocante', 'vinagre', 'vinagre balsamico', 'vinagre de vinho', 'vinagre de cidra', 'pimenta', 'pimenta preta', 'especiarias', 'oregaos', 'colorau', 'paprica', 'cominhos', 'canela', 'caril', 'acafrao', 'noz moscada', 'louro', 'tomilho', 'alecrim', 'alho em po', 'piri piri', 'cravinho', 'baunilha'],
    },
  },
  {
    key: 'coffee', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: 14, thawDays: null,
    source: `${FK}: coffee, commercial ground, pantry 2 years, opened 2 weeks; instant 1 year, opened 2-3 months`,
    terms: {
      es: ['cafe', 'cafe molido', 'cafe en grano', 'cafe soluble', 'cafe descafeinado', 'descafeinado', 'capsula de cafe', 'capsulas', 'nespresso', 'dolce gusto', 'cafe instantaneo', 'achicoria', 'cafe con leche'],
      en: ['coffee', 'ground coffee', 'coffee beans', 'instant coffee', 'decaf', 'decaf coffee', 'coffee pods', 'coffee capsules', 'espresso', 'nespresso'],
      de: ['kaffee', 'gemahlener kaffee', 'kaffeebohnen', 'loslicher kaffee', 'instantkaffee', 'entkoffeinierter kaffee', 'kaffeekapseln', 'kaffeepads', 'espresso'],
      fr: ['cafe', 'cafe moulu', 'cafe en grains', 'cafe soluble', 'cafe decafeine', 'dosettes', 'capsules de cafe', 'expresso'],
      it: ['caffe', 'caffe macinato', 'caffe in grani', 'caffe solubile', 'caffe decaffeinato', 'decaffeinato', 'capsule caffe', 'cialde', 'espresso', 'orzo solubile'],
      pt: ['cafe moido', 'cafe em grao', 'cafe soluvel', 'descafeinado', 'capsulas de cafe', 'cafe expresso'],
    },
  },
  {
    key: 'tea-cocoa', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 540, openedDays: 180, thawDays: null,
    source: `${FK}: tea bags, pantry 18-36 months, opened 6-12 months; cocoa and cocoa mixes, opened 1 year`,
    terms: {
      es: ['te', 'te verde', 'te negro', 'te rojo', 'te matcha', 'infusion', 'manzanilla', 'poleo', 'poleo menta', 'tila', 'rooibos', 'cacao', 'cacao en polvo', 'cacao soluble', 'colacao', 'cola cao', 'nesquik', 'chocolate a la taza', 'mate', 'tisana'],
      en: ['tea', 'tea bags', 'green tea', 'black tea', 'herbal tea', 'chamomile', 'peppermint tea', 'rooibos', 'matcha', 'cocoa', 'cocoa powder', 'hot chocolate', 'drinking chocolate', 'chai'],
      de: ['tee', 'teebeutel', 'gruner tee', 'schwarzer tee', 'kraeutertee', 'krautertee', 'kamillentee', 'pfefferminztee', 'rooibos', 'matcha', 'kakao', 'kakaopulver', 'trinkschokolade', 'kaba', 'nesquik'],
      fr: ['the vert', 'the noir', 'sachets de the', 'infusion', 'tisane', 'camomille', 'verveine', 'rooibos', 'matcha', 'cacao', 'cacao en poudre', 'chocolat en poudre', 'poulain', 'nesquik'],
      // Bare "thé" is left out: it folds to "the", which would swallow English names.
      it: ['te', 'te verde', 'te nero', 'tisana', 'infuso', 'camomilla', 'rooibos', 'matcha', 'cacao', 'cacao in polvere', 'cioccolata calda', 'nesquik'],
      pt: ['cha', 'cha verde', 'cha preto', 'infusao', 'tisana', 'camomila', 'cidreira', 'rooibos', 'matcha', 'cacau', 'cacau em po', 'chocolate em po', 'nesquik'],
    },
  },
  {
    key: 'dried-legumes', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: null, thawDays: null,
    source: `${FK}: beans, dried, pantry 1-2 years, opened 1 year; lentils, dried, 1 year; peas, dried split, 1 year`,
    terms: {
      es: ['legumbre', 'garbanzo', 'lenteja', 'lenteja pardina', 'lenteja roja', 'alubia', 'alubia blanca', 'alubia roja', 'judia', 'judia blanca', 'judia pinta', 'frijol', 'habas secas', 'guisante seco', 'soja texturizada', 'azuki', 'soja verde', 'fabes'],
      en: ['chickpea', 'garbanzo', 'lentil', 'red lentils', 'dried beans', 'black beans', 'kidney beans', 'pinto beans', 'navy beans', 'cannellini', 'split peas', 'mung beans', 'legume', 'pulses', 'textured soy protein'],
      de: ['kichererbsen', 'kichererbse', 'linsen', 'rote linsen', 'bohnen', 'weisse bohnen', 'getrocknete bohnen', 'schwarze bohnen', 'kidneybohnen getrocknet', 'erbsen getrocknet', 'spalterbsen', 'hulsenfruchte'],
      fr: ['pois chiche', 'lentille', 'lentilles corail', 'lentilles vertes', 'haricots secs', 'haricots blancs', 'haricots noirs', 'pois casses', 'feves seches', 'legumineuses', 'lingots'],
      it: ['ceci', 'lenticchie', 'lenticchia', 'fagioli', 'fagioli secchi', 'fagioli borlotti', 'fagioli cannellini', 'fagioli neri', 'piselli secchi', 'fave secche', 'legumi', 'cicerchie'],
      pt: ['grao de bico', 'grao', 'lentilhas', 'lentilha', 'feijao', 'feijao branco', 'feijao vermelho', 'feijao preto', 'feijao frade', 'ervilhas secas', 'favas secas', 'leguminosas'],
    },
  },
  {
    key: 'nuts-seeds', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: 60, thawDays: null,
    source: `${FK}: nuts, jars or cans, pantry 1 year, opened 2-9 months; sunflower seeds, roasted, 12 months, opened 3-4 months`,
    terms: {
      es: ['fruto seco', 'frutos secos', 'nuez', 'nueces', 'almendra', 'avellana', 'pistacho', 'anacardo', 'cacahuete', 'cacahuetes', 'pinon', 'pinones', 'castana', 'nuez de macadamia', 'nuez pecana', 'pipa', 'pipas', 'pipas de girasol', 'pipas de calabaza', 'semilla', 'semillas de chia', 'chia', 'linaza', 'sesamo', 'coctel de frutos secos', 'kikos', 'maiz tostado'],
      en: ['nuts', 'mixed nuts', 'walnut', 'almond', 'hazelnut', 'pistachio', 'cashew', 'peanut', 'pine nuts', 'macadamia', 'pecan', 'brazil nuts', 'chestnut', 'sunflower seeds', 'pumpkin seeds', 'chia seeds', 'flaxseed', 'linseed', 'sesame seeds', 'trail mix'],
      de: ['nusse', 'nuesse', 'walnusse', 'walnuss', 'mandeln', 'mandel', 'haselnusse', 'haselnuss', 'pistazien', 'cashewkerne', 'cashews', 'erdnusse', 'erdnuss', 'pinienkerne', 'macadamia', 'pekannusse', 'paranusse', 'esskastanien', 'sonnenblumenkerne', 'kurbiskerne', 'chiasamen', 'leinsamen', 'sesam', 'studentenfutter'],
      fr: ['noix', 'noix de cajou', 'amande', 'amandes', 'noisette', 'noisettes', 'pistache', 'pistaches', 'cacahuete', 'cacahuetes', 'pignons de pin', 'noix de macadamia', 'noix de pecan', 'noix du bresil', 'chataigne', 'marron', 'graines de tournesol', 'graines de courge', 'graines de chia', 'graines de lin', 'sesame', 'melange de noix'],
      it: ['frutta secca', 'noci', 'noce', 'mandorle', 'mandorla', 'nocciole', 'nocciola', 'pistacchi', 'pistacchio', 'anacardi', 'arachidi', 'noccioline', 'pinoli', 'macadamia', 'noci pecan', 'noci brasiliane', 'castagne', 'semi di girasole', 'semi di zucca', 'semi di chia', 'semi di lino', 'sesamo'],
      pt: ['frutos secos', 'noz', 'nozes', 'amendoa', 'amendoas', 'avela', 'avelas', 'pistacio', 'pistacios', 'caju', 'cajus', 'amendoim', 'amendoins', 'pinhao', 'pinhoes', 'macadamia', 'noz peca', 'castanha', 'castanhas', 'sementes de girassol', 'sementes de abobora', 'sementes de chia', 'linhaca', 'sesamo', 'pevides'],
    },
  },
  {
    key: 'broth-soup', foodType: FoodType.NON_PERISHABLE, storage: 'pantry', sealedDays: 365, openedDays: 3, thawDays: null, preparation: true,
    source: `${FK}: soup mixes, dry bouillon, pantry 1 year; canned goods, low acid (soups, stews), 2-5 years, opened 3-4 days; commercial broth, opened 3-4 days`,
    terms: {
      es: ['caldo', 'caldo de pollo', 'caldo de carne', 'caldo de pescado', 'caldo de verduras', 'fumet', 'consome', 'sopa', 'sopa de sobre', 'crema', 'crema de verduras', 'crema de calabaza', 'crema de calabacin', 'pure de verduras', 'pastilla de caldo', 'avecrem', 'gazpacho', 'salmorejo', 'vichyssoise', 'sopa de fideos', 'sopa de cebolla', 'caldo de cocido', 'sopa de miso'],
      en: ['broth', 'stock', 'chicken broth', 'beef broth', 'vegetable broth', 'chicken stock', 'stock cube', 'bouillon', 'soup', 'tomato soup', 'chicken soup', 'vegetable soup', 'cream of mushroom', 'gazpacho', 'miso soup', 'consomme', 'chowder', 'bisque'],
      de: ['bruhe', 'bruehe', 'gemusebruhe', 'huhnerbruhe', 'rinderbruhe', 'fond', 'bruhwurfel', 'suppe', 'tomatensuppe', 'huhnersuppe', 'cremesuppe', 'kurbissuppe', 'gemusesuppe', 'misosuppe', 'gazpacho'],
      fr: ['bouillon', 'bouillon de poule', 'bouillon de legumes', 'fond de veau', 'cube de bouillon', 'soupe', 'potage', 'veloute', 'veloute de potiron', 'creme de legumes', 'gaspacho', 'consomme', 'soupe miso', 'bisque'],
      it: ['brodo', 'brodo di pollo', 'brodo vegetale', 'brodo di carne', 'dado', 'dado da brodo', 'zuppa', 'minestra', 'minestrone', 'vellutata', 'crema di zucca', 'passato di verdure', 'gazpacho', 'zuppa di miso'],
      pt: ['caldo', 'caldo de galinha', 'caldo de carne', 'caldo de legumes', 'caldo de peixe', 'cubo de caldo', 'sopa', 'creme de legumes', 'creme de abobora', 'canja', 'caldo verde', 'gaspacho', 'pure de legumes'],
    },
  },
];

const OTHER_CLASSES: readonly FoodClass[] = [
  {
    key: 'condiments', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 90, openedDays: 30, thawDays: null, preparation: true,
    source: `${FK}: mayonnaise, pantry 3-6 months, opened 2 months; ketchup 1 year, opened 6 months; soy sauce 3 years, opened 1 month; salsa picante 1 year, opened 1 month; mustard 1-2 years, opened 1 year`,
    terms: {
      // Bare "salsa" lands here (90 days) rather than in pasta sauce (180): the shorter.
      es: ['salsa', 'ketchup', 'catchup', 'kepchup', 'mostaza', 'mayonesa', 'mahonesa', 'alioli', 'salsa de soja', 'salsa soja', 'salsa barbacoa', 'salsa bbq', 'bbq', 'salsa brava', 'salsa rosa', 'salsa cesar', 'salsa picante', 'tabasco', 'sriracha', 'salsa worcestershire', 'salsa perrins', 'salsa teriyaki', 'salsa de ostras', 'salsa agridulce', 'salsa curry', 'salsa tartara', 'vinagreta', 'aderezo', 'salsa yogur', 'salsa burger', 'chimichurri', 'mojo', 'mojo picon', 'wasabi', 'salsa thai', 'salsa mexicana', 'guacamole envasado', 'mostaza con miel', 'mostaza antigua'],
      en: ['sauce', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'aioli', 'soy sauce', 'barbecue sauce', 'bbq sauce', 'hot sauce', 'sriracha', 'tabasco', 'worcestershire sauce', 'teriyaki sauce', 'oyster sauce', 'sweet chili sauce', 'salad dressing', 'dressing', 'ranch', 'caesar dressing', 'vinaigrette', 'salsa', 'tartar sauce', 'horseradish', 'wasabi', 'hoisin sauce', 'brown sauce', 'chutney'],
      de: ['sosse', 'sauce', 'ketchup', 'senf', 'mayonnaise', 'mayo', 'aioli', 'sojasauce', 'sojasosse', 'barbecue sauce', 'grillsauce', 'chilisauce', 'scharfe sauce', 'sriracha', 'worcestersauce', 'salatdressing', 'dressing', 'remoulade', 'meerrettich', 'currysauce', 'wasabi'],
      fr: ['sauce', 'ketchup', 'moutarde', 'mayonnaise', 'aioli', 'sauce soja', 'sauce barbecue', 'sauce piquante', 'sriracha', 'tabasco', 'sauce worcestershire', 'vinaigrette', 'sauce salade', 'sauce tartare', 'sauce samourai', 'sauce algerienne', 'harissa', 'raifort', 'wasabi'],
      it: ['salsa', 'ketchup', 'senape', 'maionese', 'aioli', 'salsa di soia', 'salsa barbecue', 'salsa piccante', 'tabasco', 'sriracha', 'salsa worcestershire', 'condimento per insalata', 'salsa tartara', 'salsa rosa', 'salsa cocktail', 'wasabi'],
      pt: ['molho', 'ketchup', 'mostarda', 'maionese', 'alioli', 'molho de soja', 'molho barbecue', 'molho picante', 'piri piri molho', 'tabasco', 'sriracha', 'molho ingles', 'molho de salada', 'vinagrete', 'molho tartaro', 'molho cocktail', 'wasabi'],
    },
  },
  {
    key: 'snacks', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 60, openedDays: 7, thawDays: null,
    source: `${FK}: potato chips, pantry 2 months, opened 1-2 weeks; popcorn, popped in bags, 2-3 months, opened 1-2 weeks; pretzels 4-9 months, opened 3 weeks`,
    terms: {
      es: ['patata frita', 'patatas fritas', 'patatas chips', 'chips', 'aperitivo', 'snack', 'nachos', 'totopos', 'tortilla chips', 'palomitas', 'gusanitos', 'cheetos', 'doritos', 'pringles', 'ruffles', 'lays', 'corteza de cerdo', 'cortezas', 'cebolla frita', 'ganchitos', 'bocabits', 'pretzel', 'aspitos', 'patatas onduladas', 'tiras de maiz'],
      en: ['potato chips', 'chips', 'crisps', 'tortilla chips', 'nachos', 'popcorn', 'pretzels', 'snack', 'snacks', 'pork rinds', 'cheese puffs', 'doritos', 'pringles', 'fried onions', 'corn chips', 'pita chips'],
      de: ['chips', 'kartoffelchips', 'tortilla chips', 'nachos', 'popcorn', 'brezeln', 'salzbrezeln', 'flips', 'erdnussflips', 'knabbereien', 'snack', 'pringles', 'rostzwiebeln', 'kartoffelsticks'],
      fr: ['chips', 'tortilla chips', 'nachos', 'pop corn', 'popcorn', 'bretzels', 'biscuits aperitif', 'apero', 'cacahuetes enrobees', 'curly', 'pringles', 'oignons frits', 'souffles au fromage'],
      it: ['patatine', 'patatine fritte in busta', 'chips', 'tortilla chips', 'nachos', 'popcorn', 'pop corn', 'salatini', 'pretzel', 'snack', 'pringles', 'cipolla fritta', 'fonzies'],
      pt: ['batatas fritas de pacote', 'batata frita de pacote', 'chips', 'tortilla chips', 'nachos', 'pipocas', 'pretzels', 'aperitivos', 'snacks', 'pringles', 'torresmos', 'cebola frita'],
    },
  },
  {
    key: 'sweets', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 180, openedDays: 30, thawDays: null,
    source: `${FK}: gummy fruit snacks, pantry 6-9 months; chocolate, 1-2 years, opened 1 year; marshmallows 1 year, opened 1 month`,
    terms: {
      es: ['chocolate', 'chocolate negro', 'chocolate con leche', 'chocolate blanco', 'tableta de chocolate', 'bombon', 'bombones', 'chocolatina', 'kitkat', 'caramelo', 'gominola', 'chuche', 'chucherias', 'regaliz', 'piruleta', 'chicle', 'turron', 'mazapan', 'polvoron', 'nube', 'chips de chocolate', 'chip chocolate', 'pepitas de chocolate', 'after eight', 'conguitos', 'lacasitos', 'm&m', 'barrita de chocolate', 'mantecado'],
      en: ['chocolate', 'dark chocolate', 'milk chocolate', 'white chocolate', 'chocolate bar', 'candy', 'sweets', 'gummies', 'gummy bears', 'jelly beans', 'lollipop', 'chewing gum', 'gum', 'marshmallow', 'licorice', 'toffee', 'fudge', 'chocolate chips', 'candy bar', 'mints'],
      de: ['schokolade', 'zartbitterschokolade', 'milchschokolade', 'tafel schokolade', 'pralinen', 'bonbons', 'gummibarchen', 'fruchtgummi', 'lakritz', 'kaugummi', 'lutscher', 'marshmallows', 'marzipan', 'schokoriegel', 'suessigkeiten', 'sussigkeiten', 'lebkuchen'],
      fr: ['chocolat', 'chocolat noir', 'chocolat au lait', 'chocolat blanc', 'tablette de chocolat', 'bonbon', 'bonbons', 'confiserie', 'reglisse', 'sucette', 'chewing gum', 'guimauve', 'nougat', 'pate d amande', 'praline', 'barre chocolatee', 'pepites de chocolat', 'dragees'],
      it: ['cioccolato', 'cioccolato fondente', 'cioccolato al latte', 'tavoletta di cioccolato', 'cioccolatini', 'caramelle', 'caramella', 'gommose', 'liquirizia', 'lecca lecca', 'gomma da masticare', 'chewing gum', 'marshmallow', 'torrone', 'marzapane', 'gocce di cioccolato', 'barretta di cioccolato'],
      pt: ['chocolate', 'chocolate preto', 'chocolate de leite', 'tablete de chocolate', 'bombom', 'bombons', 'rebucado', 'rebucados', 'gomas', 'goma', 'alcacuz', 'chupa chupa', 'pastilha elastica', 'marshmallow', 'torrao', 'macapao', 'pepitas de chocolate', 'barra de chocolate', 'guloseimas'],
    },
  },
  {
    key: 'ready-meal', foodType: FoodType.OTHER, storage: 'fresh', sealedDays: 3, openedDays: null, thawDays: null,
    source: `${FK}: main dishes or meals, hot or refrigerated, fridge 3-4 days; guacamole 3-4 days; potato and pasta salads 3-5 days`,
    terms: {
      // "Tortilla" in Spain is the potato omelette (3 days); the wheat wrap is "tortilla de trigo".
      es: ['pizza', 'pizza fresca', 'lasana', 'tortilla', 'tortilla de patatas', 'tortilla de patata', 'ensaladilla', 'ensaladilla rusa', 'ensalada de pasta', 'guacamole', 'comida preparada', 'plato preparado', 'sandwich', 'bocadillo', 'canelones', 'musaka', 'paella', 'pollo asado preparado', 'quiche', 'empanada gallega', 'sushi', 'poke', 'wok preparado', 'pasta preparada', 'ensalada preparada', 'tabule'],
      en: ['pizza', 'lasagna', 'lasagne', 'ready meal', 'prepared meal', 'sandwich', 'wrap sandwich', 'quiche', 'potato salad', 'pasta salad', 'coleslaw', 'guacamole', 'sushi', 'meal deal', 'deli salad', 'mac and cheese', 'leftovers', 'casserole'],
      de: ['pizza', 'lasagne', 'fertiggericht', 'fertigessen', 'sandwich', 'belegtes brot', 'quiche', 'kartoffelsalat', 'nudelsalat', 'krautsalat', 'guacamole', 'sushi', 'reste', 'auflauf'],
      fr: ['pizza', 'lasagnes', 'plat prepare', 'plat cuisine', 'sandwich', 'quiche', 'quiche lorraine', 'salade de pommes de terre', 'salade de pates', 'taboule', 'guacamole', 'sushi', 'hachis parmentier', 'gratin'],
      it: ['pizza', 'lasagna', 'piatto pronto', 'piatti pronti', 'tramezzino', 'panino farcito', 'insalata di riso', 'insalata di pasta', 'insalata russa', 'guacamole', 'sushi', 'parmigiana', 'cannelloni', 'quiche', 'torta salata'],
      pt: ['pizza', 'lasanha', 'refeicao pronta', 'prato pronto', 'sandes', 'sanduiche', 'quiche', 'salada russa', 'salada de massa', 'guacamole', 'sushi', 'empadao', 'bacalhau com natas', 'arroz de pato', 'empada'],
    },
  },
  {
    key: 'dips-pate', foodType: FoodType.OTHER, storage: 'fresh', sealedDays: 7, openedDays: null, thawDays: null,
    source: `${FK}: pâté, meat or poultry, fridge 7 days; hummus, traditional, 7 days (commercial 3 months, opened 7 days)`,
    terms: {
      es: ['hummus', 'humus', 'pate', 'pate de higado', 'pate de salmon', 'foie gras', 'foie', 'paté de campana', 'tzatziki', 'dip', 'baba ganoush', 'tapenade', 'sobrasada untable', 'crema de queso para untar', 'escalivada'],
      en: ['hummus', 'pate', 'liver pate', 'foie gras', 'dip', 'tzatziki', 'baba ganoush', 'tapenade', 'salsa dip', 'onion dip', 'spinach dip', 'cheese dip'],
      de: ['hummus', 'pastete', 'leberpastete', 'leberwurst', 'foie gras', 'dip', 'tzatziki', 'aufstrich', 'brotaufstrich', 'tapenade'],
      fr: ['houmous', 'hummus', 'pate', 'pate de campagne', 'terrine', 'rillettes', 'foie gras', 'mousse de canard', 'tzatziki', 'tapenade', 'caviar d aubergine', 'tarama'],
      it: ['hummus', 'pate', 'pate di fegato', 'foie gras', 'salsa tzatziki', 'tapenade', 'crema di olive', 'patè di olive', 'crema spalmabile salata'],
      pt: ['hummus', 'homus', 'pate', 'pate de figado', 'pate de atum', 'foie gras', 'tzatziki', 'tapenade', 'pasta de atum', 'paio de barrar'],
    },
  },
  {
    key: 'frozen-meal', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 365, openedDays: null, thawDays: null,
    source: `${FK}: frozen entrees (prepared meals), freezer 12 months; pizza, frozen, 12 months`,
    terms: {
      es: ['pizza congelada', 'lasana congelada', 'comida congelada', 'plato congelado', 'congelado', 'congelados', 'precocinado congelado', 'canelones congelados', 'paella congelada', 'masa de hojaldre congelada', 'gofres congelados', 'pan congelado', 'baguette congelada'],
      en: ['frozen pizza', 'frozen lasagna', 'frozen meal', 'frozen dinner', 'tv dinner', 'frozen food', 'frozen', 'frozen waffles', 'frozen pancakes', 'frozen burrito', 'frozen dumplings'],
      de: ['tiefkuhlpizza', 'tk pizza', 'tiefkuhlkost', 'tk gericht', 'tiefkuhlgericht', 'tiefgekuhlt', 'tk lasagne', 'aufbackbrotchen'],
      fr: ['pizza surgelee', 'surgeles', 'surgele', 'plat surgele', 'lasagnes surgelees', 'gaufres surgelees'],
      it: ['pizza surgelata', 'surgelati', 'surgelato', 'piatto surgelato', 'lasagne surgelate'],
      pt: ['pizza congelada', 'congelados', 'refeicao congelada', 'lasanha congelada', 'prato congelado'],
    },
  },
  {
    key: 'baking', foodType: FoodType.OTHER, storage: 'pantry', sealedDays: 180, openedDays: 90, thawDays: null,
    source: `${FK}: baking powder, pantry 6-18 months, opened 3-6 months; yeast, packaged, 2 years, opened 4 months (fridge); baking soda 2-3 years, opened 6 months`,
    terms: {
      es: ['levadura', 'levadura quimica', 'levadura fresca', 'levadura de panadero', 'levadura royal', 'gasificante', 'impulsor', 'bicarbonato', 'bicarbonato sodico', 'gelatina', 'gelatina en polvo', 'gelatina neutra', 'cuajo', 'agar agar', 'cobertura de chocolate', 'fideos de colores', 'fondant', 'preparado para bizcocho', 'preparado para tortitas', 'flan en polvo', 'natillas en polvo'],
      en: ['yeast', 'dry yeast', 'baking powder', 'baking soda', 'bicarbonate of soda', 'gelatin', 'gelatine', 'jello', 'cake mix', 'pancake mix', 'brownie mix', 'sprinkles', 'frosting', 'icing', 'pudding mix', 'agar'],
      de: ['hefe', 'trockenhefe', 'backpulver', 'natron', 'gelatine', 'agar agar', 'backmischung', 'kuchenmischung', 'zuckerstreusel', 'glasur', 'puddingpulver', 'tortenguss'],
      fr: ['levure', 'levure boulangere', 'levure chimique', 'bicarbonate', 'gelatine', 'agar agar', 'preparation pour gateau', 'preparation pour crepes', 'vermicelles colores', 'glacage', 'nappage'],
      it: ['lievito', 'lievito di birra', 'lievito per dolci', 'bicarbonato', 'colla di pesce', 'gelatina in fogli', 'agar agar', 'preparato per torte', 'preparato per budino', 'zuccherini colorati', 'glassa', 'pan degli angeli'],
      pt: ['fermento', 'fermento de padeiro', 'fermento em po', 'bicarbonato de sodio', 'gelatina', 'agar agar', 'preparado para bolo', 'preparado para panquecas', 'granulado', 'cobertura', 'pudim em po'],
    },
  },
];

const BEVERAGE_CLASSES: readonly FoodClass[] = [
  {
    key: 'water', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: null, openedDays: null, thawDays: null,
    source: `${FK}: water, commercially bottled, pantry indefinitely`,
    terms: {
      es: ['agua', 'agua mineral', 'agua con gas', 'agua sin gas', 'agua embotellada', 'agua de mesa', 'garrafa de agua', 'agua tonica sin azucar'],
      en: ['water', 'mineral water', 'sparkling water', 'still water', 'bottled water', 'spring water', 'soda water', 'seltzer'],
      de: ['wasser', 'mineralwasser', 'sprudelwasser', 'sprudel', 'stilles wasser', 'tafelwasser', 'heilwasser'],
      fr: ['eau', 'eau minerale', 'eau gazeuse', 'eau plate', 'eau de source', 'eau petillante'],
      it: ['acqua', 'acqua minerale', 'acqua frizzante', 'acqua naturale', 'acqua gassata'],
      pt: ['agua mineral', 'agua com gas', 'agua sem gas', 'agua das pedras', 'garrafao de agua'],
    },
  },
  {
    key: 'soda', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: 180, openedDays: 2, thawDays: null,
    source: `${NDSU}: soft drinks 6 months; ${FK}: soda, opened (fridge) 2-3 days`,
    terms: {
      es: ['refresco', 'gaseosa', 'cola', 'coca cola', 'cocacola', 'coca cola zero', 'pepsi', 'fanta', 'sprite', 'seven up', '7up', 'tonica', 'agua tonica', 'kas', 'trina', 'aquarius', 'nestea', 'te frio', 'bebida isotonica', 'isotonica', 'bebida energetica', 'red bull', 'monster', 'ginger ale', 'bitter kas', 'mosto', 'tinto de verano', 'zumo con gas'],
      en: ['soda', 'soft drink', 'cola', 'coke', 'coca cola', 'diet coke', 'pepsi', 'fanta', 'sprite', '7up', 'lemonade', 'tonic', 'tonic water', 'ginger ale', 'ginger beer', 'root beer', 'iced tea', 'energy drink', 'red bull', 'sports drink', 'gatorade', 'powerade', 'fizzy drink'],
      de: ['limonade', 'limo', 'softdrink', 'cola', 'coca cola', 'pepsi', 'fanta', 'sprite', 'spezi', 'schorle', 'apfelschorle', 'tonic', 'eistee', 'energydrink', 'red bull', 'isotonisches getrank', 'brause'],
      fr: ['soda', 'boisson gazeuse', 'cola', 'coca cola', 'coca', 'pepsi', 'fanta', 'sprite', 'limonade', 'orangina', 'schweppes', 'tonic', 'the glace', 'ice tea', 'boisson energisante', 'red bull'],
      it: ['bibita', 'bibite', 'bevanda gassata', 'cola', 'coca cola', 'pepsi', 'fanta', 'sprite', 'aranciata', 'gassosa', 'chinotto', 'tonica', 'acqua tonica', 'te freddo', 'estathe', 'energy drink', 'red bull'],
      pt: ['refrigerante', 'gasosa', 'cola', 'coca cola', 'pepsi', 'fanta', 'sprite', 'sumol', 'compal', 'ice tea', 'agua tonica', 'tonica', 'bebida energetica', 'red bull', 'bebida isotonica'],
    },
  },
  {
    key: 'juice', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: 21, openedDays: 7, thawDays: null, preparation: true,
    source: `${FK}: fruit juice in cartons, fruit drinks, punch, pantry 3 weeks, opened 7-12 days`,
    terms: {
      es: ['zumo', 'jugo', 'zumo de naranja', 'zumo de pina', 'zumo de manzana', 'zumo de melocoton', 'nectar', 'smoothie', 'licuado', 'zumo multifrutas', 'zumo de tomate', 'limonada natural', 'granini', 'bifrutas', 'sunny delight'],
      en: ['juice', 'orange juice', 'apple juice', 'pineapple juice', 'grape juice', 'cranberry juice', 'tomato juice', 'nectar', 'smoothie', 'fruit drink', 'cordial', 'punch'],
      de: ['saft', 'orangensaft', 'apfelsaft', 'multivitaminsaft', 'traubensaft', 'tomatensaft', 'nektar', 'smoothie', 'fruchtsaft', 'direktsaft', 'sirup getrank'],
      fr: ['jus', 'jus d orange', 'jus de pomme', 'jus de raisin', 'jus multifruits', 'jus de tomate', 'nectar', 'smoothie', 'pur jus', 'sirop de fruits'],
      it: ['succo', 'succo d arancia', 'succo di frutta', 'succo di mela', 'succo di pesca', 'succo ace', 'spremuta', 'nettare', 'smoothie', 'succo di pomodoro'],
      pt: ['sumo', 'suco', 'sumo de laranja', 'sumo de maca', 'sumo de ananas', 'nectar', 'smoothie', 'sumo natural', 'sumo de fruta', 'sumo de tomate'],
    },
  },
  {
    key: 'beer', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: 180, openedDays: 1, thawDays: null,
    source: `No FoodKeeper or NDSU figure for beer: sealed keeps the ${LEGACY} 180; opened from ${FK} wine, opened 1-3 days`,
    terms: {
      es: ['cerveza', 'cerveza sin alcohol', 'cerveza tostada', 'cerveza artesana', 'lata de cerveza', 'botellin', 'tercio', 'quinto', 'clara', 'radler', 'sidra', 'shandy', 'ipa', 'lager'],
      en: ['beer', 'lager', 'ale', 'ipa', 'stout', 'pale ale', 'craft beer', 'alcohol free beer', 'cider', 'shandy'],
      de: ['bier', 'pils', 'pilsner', 'weissbier', 'weizen', 'helles', 'alkoholfreies bier', 'radler', 'alsterwasser', 'cidre', 'apfelwein', 'dunkles'],
      fr: ['biere', 'biere blonde', 'biere brune', 'biere sans alcool', 'panache', 'cidre', 'ipa'],
      it: ['birra', 'birra analcolica', 'birra artigianale', 'birra chiara', 'birra rossa', 'radler', 'sidro', 'ipa'],
      pt: ['cerveja', 'cerveja sem alcool', 'imperial', 'sidra', 'cerveja preta', 'ipa'],
    },
  },
  {
    key: 'wine', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: 365, openedDays: 1, thawDays: null,
    source: `${FK}: white wine, pantry 1-2 years (red 3-5); opened 1-3 days`,
    terms: {
      es: ['vino', 'vino tinto', 'vino blanco', 'vino rosado', 'cava', 'champan', 'vino dulce', 'moscatel', 'vermut', 'vermu', 'jerez', 'manzanilla de sanlucar', 'pedro ximenez', 'oporto', 'lambrusco', 'sangria', 'vino espumoso', 'vino de cocina', 'rioja', 'ribera', 'albarino', 'verdejo'],
      en: ['wine', 'red wine', 'white wine', 'rose wine', 'rose', 'sparkling wine', 'champagne', 'prosecco', 'cava', 'port', 'sherry', 'vermouth', 'sangria', 'cooking wine', 'merlot', 'chardonnay', 'sauvignon blanc', 'pinot noir'],
      de: ['wein', 'rotwein', 'weisswein', 'rosewein', 'sekt', 'schaumwein', 'champagner', 'prosecco', 'portwein', 'sherry', 'wermut', 'gluhwein', 'riesling', 'kochwein'],
      fr: ['vin', 'vin rouge', 'vin blanc', 'vin rose', 'champagne', 'cremant', 'mousseux', 'prosecco', 'porto', 'vermouth', 'muscat', 'sangria', 'bordeaux', 'bourgogne'],
      it: ['vino', 'vino rosso', 'vino bianco', 'vino rosato', 'spumante', 'prosecco', 'champagne', 'franciacorta', 'lambrusco', 'chianti', 'vermouth', 'marsala', 'moscato', 'sangria'],
      pt: ['vinho', 'vinho tinto', 'vinho branco', 'vinho rose', 'vinho verde', 'espumante', 'champanhe', 'vinho do porto', 'porto', 'moscatel', 'vinho da madeira', 'sangria'],
    },
  },
  {
    key: 'spirits', foodType: FoodType.BEVERAGE, storage: 'pantry', sealedDays: null, openedDays: null, thawDays: null,
    source: `${FK}: hard liquors, pantry indefinitely`,
    terms: {
      es: ['ginebra', 'gin', 'ron', 'whisky', 'vodka', 'tequila', 'brandy', 'conac', 'licor', 'orujo', 'pacharan', 'anis seco', 'aguardiente', 'baileys', 'licor de hierbas', 'mezcal'],
      en: ['gin', 'rum', 'whisky', 'whiskey', 'vodka', 'tequila', 'brandy', 'cognac', 'liqueur', 'bourbon', 'scotch', 'spirits', 'baileys', 'schnapps', 'mezcal'],
      de: ['gin', 'rum', 'whisky', 'wodka', 'vodka', 'tequila', 'weinbrand', 'cognac', 'likor', 'schnaps', 'korn', 'obstler', 'kraeuterlikor', 'jagermeister'],
      fr: ['gin', 'rhum', 'whisky', 'vodka', 'tequila', 'cognac', 'armagnac', 'calvados', 'liqueur', 'eau de vie', 'pastis', 'ricard'],
      it: ['gin', 'rum', 'whisky', 'vodka', 'tequila', 'brandy', 'cognac', 'liquore', 'grappa', 'amaro', 'limoncello', 'sambuca', 'amaretto'],
      pt: ['gin', 'rum', 'whisky', 'vodka', 'tequila', 'aguardente', 'conhaque', 'licor', 'bagaco', 'ginja', 'licor beirao', 'medronho'],
    },
  },
];

const HOUSEHOLD_CLASSES: readonly FoodClass[] = [
  {
    key: 'household', foodType: FoodType.HOUSEHOLD, storage: 'pantry', sealedDays: null, openedDays: null, thawDays: null,
    source: 'Non-food: does not expire',
    terms: {
      es: ['detergente', 'detergente lavadora', 'suavizante', 'lejia', 'lavavajillas', 'pastillas lavavajillas', 'friegaplatos', 'jabon de platos', 'friegasuelos', 'limpiador', 'limpiacristales', 'quitagrasas', 'amoniaco', 'papel higienico', 'papel de cocina', 'rollo de cocina', 'servilleta', 'panuelo', 'panuelos de papel', 'bolsa de basura', 'bolsas de basura', 'bolsa de congelacion', 'papel de aluminio', 'papel albal', 'film transparente', 'papel de horno', 'estropajo', 'bayeta', 'esponja', 'fregona', 'jabon', 'jabon de manos', 'gel', 'gel de ducha', 'champu', 'acondicionador', 'desodorante', 'pasta de dientes', 'dentifrico', 'cepillo de dientes', 'enjuague bucal', 'colutorio', 'cuchilla', 'maquinilla', 'espuma de afeitar', 'compresa', 'tampon', 'salvaslip', 'panal', 'toallita', 'toallitas humedas', 'crema hidratante', 'protector solar', 'algodon', 'bastoncillos', 'ambientador', 'insecticida', 'pila', 'bombilla', 'cerillas', 'vela', 'guantes', 'quitamanchas', 'sal lavavajillas', 'abrillantador', 'bolsa asa', 'bolsa de plastico', 'bolsa reutilizable', 'crema solar'],
      en: ['detergent', 'laundry detergent', 'washing powder', 'fabric softener', 'softener', 'bleach', 'dish soap', 'washing up liquid', 'dishwasher tablets', 'dishwasher pods', 'cleaner', 'all purpose cleaner', 'glass cleaner', 'toilet paper', 'toilet roll', 'paper towel', 'kitchen roll', 'napkin', 'tissue', 'tissues', 'trash bag', 'bin bag', 'garbage bag', 'aluminium foil', 'aluminum foil', 'tin foil', 'cling film', 'plastic wrap', 'baking paper', 'parchment paper', 'sponge', 'scourer', 'soap', 'hand soap', 'shower gel', 'body wash', 'shampoo', 'conditioner', 'deodorant', 'toothpaste', 'toothbrush', 'mouthwash', 'razor', 'shaving foam', 'sanitary pads', 'tampons', 'diaper', 'diapers', 'nappy', 'nappies', 'wipes', 'baby wipes', 'moisturiser', 'sunscreen', 'cotton buds', 'air freshener', 'batteries', 'battery', 'light bulb', 'candle', 'matches'],
      de: ['waschmittel', 'weichspuler', 'bleichmittel', 'spulmittel', 'geschirrspulmittel', 'spulmaschinentabs', 'reiniger', 'allzweckreiniger', 'glasreiniger', 'toilettenpapier', 'klopapier', 'kuchenrolle', 'kuchenpapier', 'servietten', 'taschentucher', 'mullbeutel', 'mullsacke', 'alufolie', 'frischhaltefolie', 'backpapier', 'schwamm', 'seife', 'handseife', 'duschgel', 'shampoo', 'spulung', 'deo', 'deodorant', 'zahnpasta', 'zahnbuerste', 'zahnburste', 'mundspulung', 'rasierer', 'rasierschaum', 'binden', 'tampons', 'windeln', 'feuchttucher', 'sonnencreme', 'wattestabchen', 'lufterfrischer', 'batterien', 'gluhbirne', 'kerze', 'streichholzer'],
      fr: ['lessive', 'adoucissant', 'eau de javel', 'javel', 'liquide vaisselle', 'pastilles lave vaisselle', 'nettoyant', 'nettoyant vitres', 'papier toilette', 'papier hygienique', 'essuie tout', 'serviettes en papier', 'mouchoirs', 'sacs poubelle', 'sac poubelle', 'papier aluminium', 'papier alu', 'film alimentaire', 'papier cuisson', 'eponge', 'savon', 'gel douche', 'shampoing', 'apres shampoing', 'deodorant', 'dentifrice', 'brosse a dents', 'bain de bouche', 'rasoir', 'mousse a raser', 'serviettes hygieniques', 'tampons', 'couches', 'lingettes', 'creme solaire', 'coton tiges', 'desodorisant', 'piles', 'ampoule', 'bougie', 'allumettes'],
      it: ['detersivo', 'detersivo lavatrice', 'ammorbidente', 'candeggina', 'varechina', 'detersivo piatti', 'pastiglie lavastoviglie', 'sgrassatore', 'detergente', 'carta igienica', 'scottex', 'carta da cucina', 'tovaglioli', 'fazzoletti', 'sacchi spazzatura', 'sacchetti immondizia', 'carta stagnola', 'alluminio', 'pellicola trasparente', 'carta forno', 'spugna', 'sapone', 'bagnoschiuma', 'docciaschiuma', 'shampoo', 'balsamo', 'deodorante', 'dentifricio', 'spazzolino', 'collutorio', 'rasoio', 'schiuma da barba', 'assorbenti', 'tamponi', 'pannolini', 'salviette', 'crema solare', 'cotton fioc', 'deodorante per ambienti', 'pile', 'lampadina', 'candela', 'fiammiferi'],
      pt: ['detergente roupa', 'detergente loica', 'amaciador', 'lixivia', 'pastilhas maquina loica', 'limpa vidros', 'limpa tudo', 'desengordurante', 'papel higienico', 'rolo de cozinha', 'papel de cozinha', 'guardanapos', 'lencos de papel', 'sacos do lixo', 'saco do lixo', 'papel de aluminio', 'pelicula aderente', 'papel vegetal', 'esponja', 'esfregao', 'sabonete', 'sabao', 'gel de banho', 'champo', 'condicionador', 'desodorizante', 'pasta de dentes', 'escova de dentes', 'elixir bucal', 'lamina', 'espuma de barbear', 'pensos higienicos', 'tampoes', 'fraldas', 'toalhitas', 'protetor solar', 'cotonetes', 'ambientador', 'pilhas', 'lampada', 'vela', 'fosforos'],
    },
  },
];

export const FOOD_CLASSES: readonly FoodClass[] = [
  ...PROTEIN_CLASSES,
  ...DAIRY_CLASSES,
  ...CARB_CLASSES,
  ...VEGETABLE_CLASSES,
  ...FRUIT_CLASSES,
  ...NON_PERISHABLE_CLASSES,
  ...OTHER_CLASSES,
  ...BEVERAGE_CLASSES,
  ...HOUSEHOLD_CLASSES,
  ...GENERIC_CLASSES,
];

export const FOOD_CLASS_BY_KEY: ReadonlyMap<string, FoodClass> = new Map(
  FOOD_CLASSES.map((c) => [c.key, c]),
);

/** The cautious class used when the type is known but not the class. */
export function genericClassFor(foodType: FoodType): FoodClass {
  return FOOD_CLASS_BY_KEY.get(`generic-${foodType}`)!;
}
