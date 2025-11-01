import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { MeasurementUnit, PantryItem } from '@core/models';
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
        locations: [
          {
            locationId: 'pantry',
            quantity: 2,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 3,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:grains',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-milk',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole milk',
        locations: [
          {
            locationId: 'fridge',
            quantity: 6,
            unit: MeasurementUnit.UNIT,
            minThreshold: 8,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-eggs',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Eggs',
        locations: [
          {
            locationId: 'fridge',
            quantity: 12,
            unit: MeasurementUnit.UNIT,
            minThreshold: 18,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-apples',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Red apples',
        locations: [
          {
            locationId: 'pantry',
            quantity: 1.5,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 2,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
          },
        ],
        categoryId: 'category:produce',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-bread',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole grain bread',
        locations: [
          {
            locationId: 'pantry',
            quantity: 1,
            unit: MeasurementUnit.UNIT,
            minThreshold: 2,
            expiryDate: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:bakery',
        expirationDate: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-oil',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Olive oil',
        locations: [
          {
            locationId: 'pantry',
            quantity: 0.75,
            unit: MeasurementUnit.LITER,
            minThreshold: 1,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 365).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:pantry',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 365).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-blueberries',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Blueberries',
        locations: [
          {
            locationId: 'fridge',
            quantity: 0.5,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 0.8,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(),
          },
        ],
        categoryId: 'category:produce',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-butter',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Butter',
        locations: [
          {
            locationId: 'fridge',
            quantity: 0,
            unit: MeasurementUnit.UNIT,
            minThreshold: 2,
            expiryDate: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        _id: 'item:sample-salad',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Mixed greens',
        locations: [
          {
            locationId: 'fridge',
            quantity: 0.2,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 0.8,
            expiryDate: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
          },
        ],
        categoryId: 'category:produce',
        expirationDate: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    await this.storage.bulkSave(items);
    this.seeded = true;
  }
}
