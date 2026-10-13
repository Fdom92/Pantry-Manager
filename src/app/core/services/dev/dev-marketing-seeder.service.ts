import { Injectable, inject } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID, STORAGE_KEYS } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { StreakState } from '@core/models/retention/streak.model';
import { generateBatchId } from '@core/utils';
import { PantryQueryService } from '../pantry/pantry-query.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { StorageService } from '../shared/storage.service';

interface ItemSeed {
  key: string;
  name: string;
  foodType: FoodType;
  productType?: 'fresh' | 'pantry';
  batches: Array<{ quantity: number; daysFromNow?: number; noExpiry?: boolean; opened?: boolean }>;
  isBasic?: boolean;
  minThreshold?: number;
  supermarket?: string;
}

const LOCALE_NAMES: Record<string, Record<string, string>> = {
  es: {
    'chicken-breast': 'Pechuga de pollo',
    'salmon-fillet': 'Filete de salmón',
    'eggs': 'Huevos',
    'turkey-slices': 'Filetes de pavo',
    'broccoli': 'Brócoli',
    'spinach': 'Espinacas',
    'carrots': 'Zanahorias',
    'tomatoes': 'Tomates',
    'bananas': 'Plátanos',
    'apples': 'Manzanas',
    'strawberries': 'Fresas',
    'avocados': 'Aguacates',
    'greek-yogurt': 'Yogur griego',
    'milk': 'Leche',
    'butter': 'Mantequilla',
    'cheese-slices': 'Lonchas de queso',
    'petit-suisse': 'Petit suisse',
    'drinkable-yogurt': 'Yogur para beber',
    'mozzarella': 'Mozzarella',
    'cream': 'Nata',
    'kefir': 'Kéfir',
    'protein-yogurt': 'Yogur proteico',
    'rice': 'Arroz',
    'pasta': 'Pasta',
    'oats': 'Avena',
    'bread': 'Pan',
    'tortillas': 'Tortillas',
    'granola': 'Granola',
    'crackers': 'Galletas saladas',
    'cereals': 'Cereales',
    'flour': 'Harina',
    'cookies': 'Galletas',
    'dishwasher-tablets': 'Pastillas lavavajillas',
    'paper-towels': 'Papel de cocina',
    'laundry-detergent': 'Detergente ropa',
    'trash-bags': 'Bolsas de basura',
    'soap': 'Jabón',
    'olive-oil': 'Aceite de oliva',
    'peanut-butter': 'Crema de cacahuete',
    'tuna-cans': 'Atún en lata',
    'tomato-sauce': 'Salsa de tomate',
    'nuts': 'Frutos secos',
  },
  de: {
    'chicken-breast': 'Hähnchenbrust',
    'salmon-fillet': 'Lachsfilet',
    'eggs': 'Eier',
    'turkey-slices': 'Putenaufschnitt',
    'broccoli': 'Brokkoli',
    'spinach': 'Spinat',
    'carrots': 'Karotten',
    'tomatoes': 'Tomaten',
    'bananas': 'Bananen',
    'apples': 'Äpfel',
    'strawberries': 'Erdbeeren',
    'avocados': 'Avocados',
    'greek-yogurt': 'Griechischer Joghurt',
    'milk': 'Milch',
    'butter': 'Butter',
    'cheese-slices': 'Käsescheiben',
    'petit-suisse': 'Petit Suisse',
    'drinkable-yogurt': 'Trinkjoghurt',
    'mozzarella': 'Mozzarella',
    'cream': 'Sahne',
    'kefir': 'Kefir',
    'protein-yogurt': 'Protein-Joghurt',
    'rice': 'Reis',
    'pasta': 'Nudeln',
    'oats': 'Haferflocken',
    'bread': 'Brot',
    'tortillas': 'Tortillas',
    'granola': 'Knuspermüsli',
    'crackers': 'Cracker',
    'cereals': 'Cerealien',
    'flour': 'Mehl',
    'cookies': 'Kekse',
    'dishwasher-tablets': 'Spülmaschinentabs',
    'paper-towels': 'Küchenrolle',
    'laundry-detergent': 'Waschmittel',
    'trash-bags': 'Müllbeutel',
    'soap': 'Seife',
    'olive-oil': 'Olivenöl',
    'peanut-butter': 'Erdnussbutter',
    'tuna-cans': 'Thunfischdosen',
    'tomato-sauce': 'Tomatensoße',
    'nuts': 'Nüsse',
  },
  fr: {
    'chicken-breast': 'Blanc de poulet',
    'salmon-fillet': 'Filet de saumon',
    'eggs': 'Œufs',
    'turkey-slices': 'Tranches de dinde',
    'broccoli': 'Brocoli',
    'spinach': 'Épinards',
    'carrots': 'Carottes',
    'tomatoes': 'Tomates',
    'bananas': 'Bananes',
    'apples': 'Pommes',
    'strawberries': 'Fraises',
    'avocados': 'Avocats',
    'greek-yogurt': 'Yaourt grec',
    'milk': 'Lait',
    'butter': 'Beurre',
    'cheese-slices': 'Tranches de fromage',
    'petit-suisse': 'Petit-suisse',
    'drinkable-yogurt': 'Yaourt à boire',
    'mozzarella': 'Mozzarella',
    'cream': 'Crème',
    'kefir': 'Kéfir',
    'protein-yogurt': 'Yaourt protéiné',
    'rice': 'Riz',
    'pasta': 'Pâtes',
    'oats': "Flocons d'Avoine",
    'bread': 'Pain',
    'tortillas': 'Tortillas',
    'granola': 'Granola',
    'crackers': 'Crackers',
    'cereals': 'Céréales',
    'flour': 'Farine',
    'cookies': 'Biscuits',
    'dishwasher-tablets': 'Tablettes lave-vaisselle',
    'paper-towels': 'Essuie-tout',
    'laundry-detergent': 'Lessive',
    'trash-bags': 'Sacs poubelle',
    'soap': 'Savon',
    'olive-oil': "Huile d'Olive",
    'peanut-butter': 'Beurre de cacahuète',
    'tuna-cans': 'Thon en boîte',
    'tomato-sauce': 'Sauce tomate',
    'nuts': 'Fruits à coque',
  },
  it: {
    'chicken-breast': 'Petto di pollo',
    'salmon-fillet': 'Filetto di salmone',
    'eggs': 'Uova',
    'turkey-slices': 'Fette di tacchino',
    'broccoli': 'Broccoli',
    'spinach': 'Spinaci',
    'carrots': 'Carote',
    'tomatoes': 'Pomodori',
    'bananas': 'Banane',
    'apples': 'Mele',
    'strawberries': 'Fragole',
    'avocados': 'Avocado',
    'greek-yogurt': 'Yogurt greco',
    'milk': 'Latte',
    'butter': 'Burro',
    'cheese-slices': 'Fette di formaggio',
    'petit-suisse': 'Petit suisse',
    'drinkable-yogurt': 'Yogurt da bere',
    'mozzarella': 'Mozzarella',
    'cream': 'Panna',
    'kefir': 'Kefir',
    'protein-yogurt': 'Yogurt proteico',
    'rice': 'Riso',
    'pasta': 'Pasta',
    'oats': "Fiocchi d'Avena",
    'bread': 'Pane',
    'tortillas': 'Tortillas',
    'granola': 'Granola',
    'crackers': 'Cracker',
    'cereals': 'Cereali',
    'flour': 'Farina',
    'cookies': 'Biscotti',
    'dishwasher-tablets': 'Pastiglie lavastoviglie',
    'paper-towels': 'Carta da cucina',
    'laundry-detergent': 'Detersivo bucato',
    'trash-bags': 'Sacchetti spazzatura',
    'soap': 'Sapone',
    'olive-oil': "Olio d'Oliva",
    'peanut-butter': 'Burro di arachidi',
    'tuna-cans': 'Tonno in scatola',
    'tomato-sauce': 'Salsa di pomodoro',
    'nuts': 'Frutta secca',
  },
  pt: {
    'chicken-breast': 'Peito de frango',
    'salmon-fillet': 'Filete de salmão',
    'eggs': 'Ovos',
    'turkey-slices': 'Fatias de peru',
    'broccoli': 'Brócolos',
    'spinach': 'Espinafres',
    'carrots': 'Cenouras',
    'tomatoes': 'Tomates',
    'bananas': 'Bananas',
    'apples': 'Maçãs',
    'strawberries': 'Morangos',
    'avocados': 'Abacates',
    'greek-yogurt': 'Iogurte grego',
    'milk': 'Leite',
    'butter': 'Manteiga',
    'cheese-slices': 'Fatias de queijo',
    'petit-suisse': 'Petit suisse',
    'drinkable-yogurt': 'Iogurte líquido',
    'mozzarella': 'Mozzarella',
    'cream': 'Natas',
    'kefir': 'Kefir',
    'protein-yogurt': 'Iogurte proteico',
    'rice': 'Arroz',
    'pasta': 'Massa',
    'oats': 'Aveia',
    'bread': 'Pão',
    'tortillas': 'Tortilhas',
    'granola': 'Granola',
    'crackers': 'Bolachas de água e sal',
    'cereals': 'Cereais',
    'flour': 'Farinha',
    'cookies': 'Bolachas',
    'dishwasher-tablets': 'Pastilhas para a máquina',
    'paper-towels': 'Rolo de cozinha',
    'laundry-detergent': 'Detergente da roupa',
    'trash-bags': 'Sacos do lixo',
    'soap': 'Sabão',
    'olive-oil': 'Azeite',
    'peanut-butter': 'Manteiga de amendoim',
    'tuna-cans': 'Latas de atum',
    'tomato-sauce': 'Molho de tomate',
    'nuts': 'Frutos secos',
  },
};

/**
 * A real pantry's products carry the category the user picked, and the PRO waste card's
 * "top category" line is built from it; seeded products had none, so that line never showed.
 */
const CATEGORY_NAMES: Record<string, Record<FoodType, string>> = {
  es: { protein: 'Proteínas', carb: 'Cereales y pasta', vegetable: 'Verduras', fruit: 'Frutas', dairy: 'Lácteos', beverage: 'Bebidas', 'non-perishable': 'Despensa', household: 'Hogar', other: 'Otros' },
  en: { protein: 'Protein', carb: 'Grains and pasta', vegetable: 'Vegetables', fruit: 'Fruit', dairy: 'Dairy', beverage: 'Drinks', 'non-perishable': 'Pantry staples', household: 'Household', other: 'Other' },
  de: { protein: 'Eiweiß', carb: 'Getreide und Nudeln', vegetable: 'Gemüse', fruit: 'Obst', dairy: 'Milchprodukte', beverage: 'Getränke', 'non-perishable': 'Vorrat', household: 'Haushalt', other: 'Sonstiges' },
  fr: { protein: 'Protéines', carb: 'Céréales et pâtes', vegetable: 'Légumes', fruit: 'Fruits', dairy: 'Produits laitiers', beverage: 'Boissons', 'non-perishable': 'Épicerie', household: 'Maison', other: 'Autres' },
  it: { protein: 'Proteine', carb: 'Cereali e pasta', vegetable: 'Verdure', fruit: 'Frutta', dairy: 'Latticini', beverage: 'Bevande', 'non-perishable': 'Dispensa', household: 'Casa', other: 'Altro' },
  pt: { protein: 'Proteínas', carb: 'Cereais e massa', vegetable: 'Legumes', fruit: 'Fruta', dairy: 'Laticínios', beverage: 'Bebidas', 'non-perishable': 'Despensa', household: 'Casa', other: 'Outros' },
};

/**
 * Seeds name their main supermarket "Mercadona" because the author is Spanish; a store listing in
 * another language showing it gives away a Spanish test device. Swap in a chain that exists there.
 */
const LOCAL_MAIN_SUPERMARKET: Record<string, string> = {
  es: 'Mercadona',
  en: 'Tesco',
  de: 'REWE',
  fr: 'Carrefour',
  it: 'Conad',
  pt: 'Continente',
};

@Injectable({ providedIn: 'root' })
export class DevMarketingSeederService {
  private readonly pantry = inject(PantryQueryService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly storage = inject(StorageService) as StorageService<StreakState>;

  async seedMarketingDatabase(locale = 'en'): Promise<void> {
    await this.clearAll();
    const savedItems = await this.seedItems(locale);
    await this.seedHistoryEvents(savedItems);
    await this.seedStreak();
    await this.pantry.reloadFromStart();
  }

  private async clearAll(): Promise<void> {
    const [items, events] = await Promise.all([
      this.pantry.getAll(),
      this.eventLog.listEvents(),
    ]);
    await Promise.all([
      ...items.map(i => this.pantry.deleteItem(i._id)),
      ...events.map(e => this.eventLog.remove(e._id)),
      this.storage.remove(STORAGE_KEYS.STREAK_DOC_ID),
    ]);
  }

  /**
   * An empty streak card ("0 days, add a product to start") is the first thing a
   * store visitor sees on the dashboard. The in-memory streak state is read at app
   * start, so the app has to be restarted after seeding for this to show.
   */
  private async seedStreak(): Promise<void> {
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const startedAt = new Date(today);
    startedAt.setDate(startedAt.getDate() - 8);
    const stamp = today.toISOString();
    await this.storage.save({
      _id: STORAGE_KEYS.STREAK_DOC_ID,
      type: 'streak',
      createdAt: stamp,
      updatedAt: stamp,
      currentStreak: 9,
      longestStreak: 9,
      lastActiveDate: iso(today),
      graceTokens: 2,
      milestonesReached: [3, 7],
      startedAt: startedAt.toISOString(),
    } as StreakState);
  }

  private async seedItems(locale = 'en'): Promise<Map<string, PantryItem>> {
    const names = LOCALE_NAMES[locale] ?? {};
    const supermarketOf = (name?: string) => (name === 'Mercadona' ? LOCAL_MAIN_SUPERMARKET[locale] ?? name : name);
    const ts = Date.now();
    const mkId = (key: string) => `item:mkt-${ts}-${key}`;
    const now = new Date();
    const expiry = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };

    const seeds: ItemSeed[] = [
      // ── Fresh Proteins ──────────────────────────────────────────
      {
        key: 'chicken-breast',
        name: 'Chicken breast',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 1 }],
        isBasic: true,
        minThreshold: 2,
        supermarket: 'Mercadona',
      },
      {
        key: 'salmon-fillet',
        name: 'Salmon fillet',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 3, daysFromNow: 2 }],
      },
      {
        key: 'eggs',
        name: 'Eggs',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 6, daysFromNow: 14 }],
        isBasic: true,
        minThreshold: 12,
        supermarket: 'Lidl',
      },
      {
        key: 'turkey-slices',
        name: 'Turkey slices',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 2 }],
      },

      // ── Fresh Vegetables ────────────────────────────────────────
      {
        key: 'broccoli',
        name: 'Broccoli',
        foodType: FoodType.VEGETABLE,
        productType: 'fresh',
        batches: [{ quantity: 3, daysFromNow: 5 }],
      },
      {
        key: 'spinach',
        name: 'Spinach',
        foodType: FoodType.VEGETABLE,
        productType: 'fresh',
        batches: [{ quantity: 3, daysFromNow: 6 }],
      },
      {
        key: 'carrots',
        name: 'Carrots',
        foodType: FoodType.VEGETABLE,
        productType: 'fresh',
        batches: [{ quantity: 3, noExpiry: true }],
      },
      {
        key: 'tomatoes',
        name: 'Tomatoes',
        foodType: FoodType.VEGETABLE,
        productType: 'fresh',
        batches: [{ quantity: 4, daysFromNow: 5 }],
      },

      // ── Fresh Fruit ─────────────────────────────────────────────
      {
        key: 'bananas',
        name: 'Bananas',
        foodType: FoodType.FRUIT,
        productType: 'fresh',
        batches: [{ quantity: 5, noExpiry: true }],
      },
      {
        key: 'apples',
        name: 'Apples',
        foodType: FoodType.FRUIT,
        productType: 'fresh',
        batches: [{ quantity: 4, noExpiry: true }],
      },
      {
        key: 'strawberries',
        name: 'Strawberries',
        foodType: FoodType.FRUIT,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 1 }],
      },
      {
        key: 'avocados',
        name: 'Avocados',
        foodType: FoodType.FRUIT,
        productType: 'fresh',
        batches: [{ quantity: 3, daysFromNow: 4 }],
      },

      // ── Dairy ────────────────────────────────────────────────────
      {
        key: 'greek-yogurt',
        name: 'Greek yogurt',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 1, daysFromNow: 4 }],
        isBasic: true,
        minThreshold: 3,
        supermarket: 'Lidl',
      },
      {
        key: 'milk',
        name: 'Milk',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 1, daysFromNow: 3 }],
        isBasic: true,
        minThreshold: 2,
        supermarket: 'Lidl',
      },
      {
        key: 'butter',
        name: 'Butter',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 30 }],
      },
      {
        key: 'cheese-slices',
        name: 'Cheese slices',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 20 }],
      },
      {
        key: 'petit-suisse',
        name: 'Petit suisse',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 18 }],
      },
      {
        key: 'drinkable-yogurt',
        name: 'Drinkable yogurt',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 3, daysFromNow: 7 }],
      },
      {
        key: 'mozzarella',
        name: 'Mozzarella',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 1, daysFromNow: 5 }],
      },
      {
        key: 'cream',
        name: 'Cream',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 1, daysFromNow: 21 }],
      },
      {
        key: 'kefir',
        name: 'Kefir',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 25 }],
      },
      {
        key: 'protein-yogurt',
        name: 'Protein yogurt',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 14 }],
      },

      // ── Carbs ────────────────────────────────────────────────────
      {
        key: 'rice',
        name: 'Rice',
        foodType: FoodType.CARB,
        batches: [{ quantity: 1, noExpiry: true }],
        isBasic: true,
        minThreshold: 3,
        supermarket: 'Mercadona',
      },
      {
        key: 'pasta',
        name: 'Pasta',
        foodType: FoodType.CARB,
        batches: [{ quantity: 3, noExpiry: true }],
      },
      {
        key: 'oats',
        name: 'Oats',
        foodType: FoodType.CARB,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'bread',
        name: 'Bread',
        foodType: FoodType.CARB,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 2 }],
      },
      {
        key: 'tortillas',
        name: 'Tortillas',
        foodType: FoodType.CARB,
        batches: [{ quantity: 1, daysFromNow: 10 }],
      },
      {
        key: 'granola',
        name: 'Granola',
        foodType: FoodType.CARB,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'crackers',
        name: 'Crackers',
        foodType: FoodType.CARB,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'cereals',
        name: 'Cereals',
        foodType: FoodType.CARB,
        batches: [{ quantity: 1, noExpiry: true }],
      },
      {
        key: 'flour',
        name: 'Flour',
        foodType: FoodType.CARB,
        batches: [{ quantity: 1, noExpiry: true }],
      },
      {
        key: 'cookies',
        name: 'Cookies',
        foodType: FoodType.CARB,
        batches: [{ quantity: 2, noExpiry: true }],
      },

      // ── Household ────────────────────────────────────────────────
      {
        key: 'dishwasher-tablets',
        name: 'Dishwasher tablets',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 3, noExpiry: true }],
        isBasic: true,
        minThreshold: 5,
      },
      {
        key: 'paper-towels',
        name: 'Paper towels',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'laundry-detergent',
        name: 'Laundry detergent',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 1, noExpiry: true }],
        isBasic: true,
        minThreshold: 2,
      },
      {
        key: 'trash-bags',
        name: 'Trash bags',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 5, noExpiry: true }],
      },
      {
        key: 'soap',
        name: 'Soap',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 3, noExpiry: true }],
      },

      // ── Other ────────────────────────────────────────────────────
      {
        key: 'olive-oil',
        name: 'Olive oil',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 1, noExpiry: true }],
      },
      {
        key: 'peanut-butter',
        name: 'Peanut butter',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'tuna-cans',
        name: 'Tuna cans',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 4, noExpiry: true }],
      },
      {
        key: 'tomato-sauce',
        name: 'Tomato sauce',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 3, noExpiry: true }],
      },
      {
        key: 'nuts',
        name: 'Nuts',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 1, noExpiry: true }],
      },
    ];

    const saved = new Map<string, PantryItem>();
    for (const seed of seeds) {
      const item = await this.pantry.saveItem({
        _id: mkId(seed.key),
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: names[seed.key] ?? seed.name,
        categoryId: CATEGORY_NAMES[locale]?.[seed.foodType] ?? '',
        foodType: seed.foodType,
        productType: seed.productType,
        isBasic: seed.isBasic,
        minThreshold: seed.minThreshold,
        supermarket: supermarketOf(seed.supermarket),
        batches: seed.batches.map(b => ({
          batchId: generateBatchId(),
          quantity: b.quantity,
          expirationDate: b.daysFromNow != null ? expiry(b.daysFromNow) : undefined,
          noExpiry: b.noExpiry,
          opened: b.opened,
        })),
      } as PantryItem);
      saved.set(seed.key, item);
    }
    return saved;
  }

  private async seedHistoryEvents(items: Map<string, PantryItem>): Promise<void> {
    const now = new Date();
    const ts = (daysAgo: number): string => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };
    const id = (key: string) => items.get(key)?._id ?? '';
    const name = (key: string) => items.get(key)?.name ?? key;
    const cat = (key: string) => items.get(key)?.categoryId;
    const ft = (key: string) => items.get(key)?.foodType;

    const addEvents: Array<{ key: string; qty: number; daysAgo: number }> = [
      { key: 'eggs', qty: 12, daysAgo: 28 },
      { key: 'rice', qty: 2, daysAgo: 24 },
      { key: 'pasta', qty: 3, daysAgo: 21 },
      { key: 'olive-oil', qty: 2, daysAgo: 18 },
      { key: 'greek-yogurt', qty: 3, daysAgo: 15 },
      { key: 'chicken-breast', qty: 2, daysAgo: 12 },
      { key: 'crackers', qty: 2, daysAgo: 9 },
      { key: 'milk', qty: 2, daysAgo: 7 },
      { key: 'salmon-fillet', qty: 1, daysAgo: 5 },
      { key: 'strawberries', qty: 1, daysAgo: 2 },
      // Weekly shops: the rotation card compares uses against additions, and a
      // shop-heavy month keeps it in a believable high-but-not-absurd range.
      { key: 'bananas', qty: 3, daysAgo: 27 },
      { key: 'bread', qty: 2, daysAgo: 26 },
      { key: 'tomatoes', qty: 4, daysAgo: 25 },
      { key: 'cheese-slices', qty: 1, daysAgo: 22 },
      { key: 'carrots', qty: 2, daysAgo: 20 },
      { key: 'butter', qty: 1, daysAgo: 19 },
      { key: 'apples', qty: 4, daysAgo: 17 },
      { key: 'tuna-cans', qty: 3, daysAgo: 14 },
      { key: 'broccoli', qty: 1, daysAgo: 13 },
      { key: 'avocados', qty: 2, daysAgo: 11 },
      { key: 'cereals', qty: 1, daysAgo: 8 },
      { key: 'tomato-sauce', qty: 2, daysAgo: 6 },
      { key: 'spinach', qty: 1, daysAgo: 4 },
      { key: 'tortillas', qty: 1, daysAgo: 3 },
    ];

    const consumeEvents: Array<{ key: string; qty: number; daysAgo: number }> = [
      { key: 'eggs', qty: 3, daysAgo: 27 },
      { key: 'eggs', qty: 3, daysAgo: 23 },
      { key: 'chicken-breast', qty: 1, daysAgo: 22 },
      { key: 'milk', qty: 1, daysAgo: 18 },
      { key: 'bananas', qty: 3, daysAgo: 16 },
      { key: 'greek-yogurt', qty: 2, daysAgo: 15 },
      { key: 'olive-oil', qty: 1, daysAgo: 14 },
      { key: 'eggs', qty: 3, daysAgo: 13 },
      { key: 'chicken-breast', qty: 1, daysAgo: 11 },
      { key: 'cookies', qty: 1, daysAgo: 10 },
      { key: 'bread', qty: 1, daysAgo: 9 },
      { key: 'greek-yogurt', qty: 1, daysAgo: 8 },
      { key: 'milk', qty: 1, daysAgo: 7 },
      { key: 'pasta', qty: 1, daysAgo: 6 },
      { key: 'crackers', qty: 1, daysAgo: 5 },
      { key: 'eggs', qty: 3, daysAgo: 4 },
      { key: 'bread', qty: 1, daysAgo: 3 },
      { key: 'rice', qty: 1, daysAgo: 3 },
      { key: 'greek-yogurt', qty: 1, daysAgo: 2 },
      { key: 'milk', qty: 1, daysAgo: 1 },
      { key: 'bananas', qty: 2, daysAgo: 1 },
    ];

    // Two this month and four the month before: the PRO trend reads as an improvement.
    const expireEvents: Array<{ key: string; qty: number; daysAgo: number }> = [
      // This month: two, so the card shows a real (and improving) figure instead of its empty state.
      { key: 'bananas', qty: 2, daysAgo: 6 },
      { key: 'strawberries', qty: 1, daysAgo: 17 },
      { key: 'cream', qty: 1, daysAgo: 34 },
      { key: 'milk', qty: 1, daysAgo: 40 },
      { key: 'cheese-slices', qty: 1, daysAgo: 45 },
      { key: 'greek-yogurt', qty: 1, daysAgo: 52 },
    ];

    const tasks: Promise<unknown>[] = [];

    for (const ev of addEvents) {
      if (!id(ev.key)) continue;
      tasks.push(this.eventLog.logAddEvent({
        productId: id(ev.key),
        productName: name(ev.key),
        quantity: ev.qty,
        deltaQuantity: ev.qty,
        previousQuantity: 0,
        nextQuantity: ev.qty,
        source: 'add_modal',
        categoryId: cat(ev.key),
        foodType: ft(ev.key),
        timestamp: ts(ev.daysAgo),
      }));
    }

    for (const ev of consumeEvents) {
      if (!id(ev.key)) continue;
      tasks.push(this.eventLog.logConsumeEvent({
        productId: id(ev.key),
        productName: name(ev.key),
        quantity: ev.qty,
        deltaQuantity: -ev.qty,
        source: 'quantity_sheet',
        categoryId: cat(ev.key),
        foodType: ft(ev.key),
        timestamp: ts(ev.daysAgo),
      }));
    }

    for (const ev of expireEvents) {
      if (!id(ev.key)) continue;
      tasks.push(this.eventLog.logExpireEvent({
        productId: id(ev.key),
        productName: name(ev.key),
        quantity: ev.qty,
        source: 'system',
        categoryId: cat(ev.key),
        foodType: ft(ev.key),
        timestamp: ts(ev.daysAgo),
      }));
    }

    await Promise.all(tasks);
  }
}
