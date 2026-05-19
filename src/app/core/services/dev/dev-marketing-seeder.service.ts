import { Injectable, inject } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { EventParams } from '@core/models/events';
import { generateBatchId } from '@core/utils';
import { PantryService } from '../pantry/pantry.service';
import { HistoryEventLogService } from '../history/history-event-log.service';

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

@Injectable({ providedIn: 'root' })
export class DevMarketingSeederService {
  private readonly pantry = inject(PantryService);
  private readonly eventLog = inject(HistoryEventLogService);

  async seedMarketingDatabase(): Promise<void> {
    await this.clearAll();
    const savedItems = await this.seedItems();
    await this.seedHistoryEvents(savedItems);
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
    ]);
  }

  private async seedItems(): Promise<Map<string, PantryItem>> {
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
        name: 'Chicken Breast',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 1 }],
        isBasic: true,
        minThreshold: 2,
        supermarket: 'Mercadona',
      },
      {
        key: 'salmon-fillet',
        name: 'Salmon Fillet',
        foodType: FoodType.PROTEIN,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: -3 }],
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
        name: 'Turkey Slices',
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
        batches: [{ quantity: 1, daysFromNow: 5 }],
      },
      {
        key: 'spinach',
        name: 'Spinach',
        foodType: FoodType.VEGETABLE,
        productType: 'fresh',
        batches: [{ quantity: 1, daysFromNow: 6 }],
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
        batches: [{ quantity: 2, daysFromNow: 4 }],
      },

      // ── Dairy ────────────────────────────────────────────────────
      {
        key: 'greek-yogurt',
        name: 'Greek Yogurt',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 1, daysFromNow: -2 }],
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
        name: 'Cheese Slices',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: 20 }],
      },
      {
        key: 'petit-suisse',
        name: 'Petit Suisse',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: -4 }],
      },
      {
        key: 'drinkable-yogurt',
        name: 'Drinkable Yogurt',
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
        batches: [{ quantity: 1, daysFromNow: -10 }],
      },
      {
        key: 'kefir',
        name: 'Kefir',
        foodType: FoodType.DAIRY,
        batches: [{ quantity: 2, daysFromNow: -5 }],
      },
      {
        key: 'protein-yogurt',
        name: 'Protein Yogurt',
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
        name: 'Dishwasher Tablets',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 3, noExpiry: true }],
        isBasic: true,
        minThreshold: 5,
      },
      {
        key: 'paper-towels',
        name: 'Paper Towels',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'laundry-detergent',
        name: 'Laundry Detergent',
        foodType: FoodType.HOUSEHOLD,
        batches: [{ quantity: 1, noExpiry: true }],
        isBasic: true,
        minThreshold: 2,
      },
      {
        key: 'trash-bags',
        name: 'Trash Bags',
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
        name: 'Olive Oil',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 1, noExpiry: true }],
      },
      {
        key: 'peanut-butter',
        name: 'Peanut Butter',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 2, noExpiry: true }],
      },
      {
        key: 'tuna-cans',
        name: 'Tuna Cans',
        foodType: FoodType.OTHER,
        batches: [{ quantity: 4, noExpiry: true }],
      },
      {
        key: 'tomato-sauce',
        name: 'Tomato Sauce',
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
        name: seed.name,
        categoryId: '',
        foodType: seed.foodType,
        productType: seed.productType,
        isBasic: seed.isBasic,
        minThreshold: seed.minThreshold,
        supermarket: seed.supermarket,
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
    ];

    const consumeEvents: Array<{ key: string; qty: number; daysAgo: number }> = [
      { key: 'eggs', qty: 3, daysAgo: 27 },
      { key: 'milk', qty: 1, daysAgo: 26 },
      { key: 'greek-yogurt', qty: 1, daysAgo: 25 },
      { key: 'eggs', qty: 3, daysAgo: 23 },
      { key: 'chicken-breast', qty: 1, daysAgo: 22 },
      { key: 'pasta', qty: 1, daysAgo: 20 },
      { key: 'rice', qty: 1, daysAgo: 19 },
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

    const expireEvents: Array<{ key: string; qty: number; daysAgo: number }> = [
      { key: 'cream', qty: 1, daysAgo: 10 },
      { key: 'salmon-fillet', qty: 1, daysAgo: 3 },
      { key: 'milk', qty: 1, daysAgo: 20 },
      { key: 'greek-yogurt', qty: 1, daysAgo: 30 },
      { key: 'cheese-slices', qty: 1, daysAgo: 45 },
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
