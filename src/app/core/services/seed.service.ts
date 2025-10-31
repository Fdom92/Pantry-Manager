import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { MeasurementUnit, PantryItem, StockStatus } from '@core/models';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

@Injectable({ providedIn: 'root' })
export class SeedService {
  private seeded = false;

  constructor(private storage: StorageService<PantryItem>) {}

  async ensureSeedData(): Promise<void> {
    if (this.seeded) return;

    const existing = await this.storage.all('item');
    if (existing.length > 0) {
      this.seeded = true;
      return;
    }

    const now = Date.now();
    const nowIso = new Date().toISOString();

    const items: PantryItem[] = [
      {
        _id: 'item:sample-rice',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'White rice',
        stock: {
          quantity: 2,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.LOW,
          minThreshold: 3,
          isBasic: true,
        },
        categoryId: 'category:grains',
        locationId: 'pantry',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(), // 3 meses
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-milk',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole milk',
        stock: {
          quantity: 6,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 8,
          isBasic: true,
        },
        categoryId: 'category:dairy',
        locationId: 'fridge',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-eggs',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Eggs',
        stock: {
          quantity: 12,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 18,
          isBasic: true,
        },
        categoryId: 'category:dairy',
        locationId: 'fridge',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-apples',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Red apples',
        stock: {
          quantity: 1.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
          minThreshold: 2,
        },
        categoryId: 'category:produce',
        locationId: 'pantry',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-bread',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole grain bread',
        stock: {
          quantity: 1,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 2,
          isBasic: true,
        },
        categoryId: 'category:bakery',
        locationId: 'pantry',
        expirationDate: new Date(now - 1000 * 60 * 60 * 24).toISOString(), // vencido
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-oil',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Olive oil',
        stock: {
          quantity: 0.75,
          unit: MeasurementUnit.LITER,
          status: StockStatus.LOW,
          minThreshold: 1,
          isBasic: true,
        },
        categoryId: 'category:pantry',
        locationId: 'pantry',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 365).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-blueberries',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Blueberries',
        stock: {
          quantity: 0.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
          minThreshold: 0.8,
        },
        categoryId: 'category:produce',
        locationId: 'fridge',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-butter',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Butter',
        stock: {
          quantity: 0,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.EMPTY,
          minThreshold: 2,
          isBasic: true,
        },
        categoryId: 'category:dairy',
        locationId: 'fridge',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-salad',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Mixed greens',
        stock: {
          quantity: 0.2,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.LOW,
          minThreshold: 0.8,
        },
        categoryId: 'category:produce',
        locationId: 'fridge',
        expirationDate: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    await this.storage.bulkSave(items);
    this.seeded = true;
  }
}
