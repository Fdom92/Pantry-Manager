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
    const DAY = 1000 * 60 * 60 * 24;
    const plusDays = (days: number) => new Date(now + DAY * days).toISOString();
    const minusDays = (days: number) => new Date(now - DAY * days).toISOString();

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
            batches: [
              {
                batchId: 'batch:seed-rice-1',
                quantity: 1.2,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(180),
                opened: true,
              },
              {
                batchId: 'batch:seed-rice-2',
                quantity: 0.8,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(60),
              },
            ],
          },
          {
            locationId: 'kitchen',
            quantity: 0.5,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 1,
            batches: [
              {
                batchId: 'batch:seed-rice-3',
                quantity: 0.5,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(30),
                opened: true,
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:grains',
        expirationDate: plusDays(30),
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
            batches: [
              {
                batchId: 'batch:seed-milk-1',
                quantity: 3,
                unit: MeasurementUnit.UNIT,
                expirationDate: plusDays(7),
                opened: true,
              },
              {
                batchId: 'batch:seed-milk-2',
                quantity: 3,
                unit: MeasurementUnit.UNIT,
                expirationDate: plusDays(12),
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: plusDays(7),
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
            batches: [
              {
                batchId: 'batch:seed-eggs-1',
                quantity: 12,
                unit: MeasurementUnit.UNIT,
                expirationDate: plusDays(14),
                opened: true,
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: plusDays(14),
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
            quantity: 1,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 2,
            batches: [
              {
                batchId: 'batch:seed-apples-1',
                quantity: 0.6,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(10),
                opened: true,
              },
              {
                batchId: 'batch:seed-apples-2',
                quantity: 0.4,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(5),
              },
            ],
          },
          {
            locationId: 'fridge',
            quantity: 0.8,
            unit: MeasurementUnit.KILOGRAM,
            minThreshold: 1,
            batches: [
              {
                batchId: 'batch:seed-apples-3',
                quantity: 0.8,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(12),
              },
            ],
          },
        ],
        categoryId: 'category:produce',
        expirationDate: plusDays(5),
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
            batches: [
              {
                batchId: 'batch:seed-bread-1',
                quantity: 1,
                unit: MeasurementUnit.UNIT,
                expirationDate: minusDays(1),
                opened: true,
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:bakery',
        expirationDate: minusDays(1),
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
            batches: [
              {
                batchId: 'batch:seed-oil-1',
                quantity: 0.75,
                unit: MeasurementUnit.LITER,
                expirationDate: plusDays(365),
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:pantry',
        expirationDate: plusDays(365),
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
            batches: [
              {
                batchId: 'batch:seed-blueberries-1',
                quantity: 0.3,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(5),
                opened: true,
              },
              {
                batchId: 'batch:seed-blueberries-2',
                quantity: 0.2,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: plusDays(2),
              },
            ],
          },
        ],
        categoryId: 'category:produce',
        expirationDate: plusDays(2),
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
            quantity: 0.5,
            unit: MeasurementUnit.UNIT,
            minThreshold: 2,
            batches: [
              {
                batchId: 'batch:seed-butter-1',
                quantity: 0.5,
                unit: MeasurementUnit.UNIT,
                expirationDate: plusDays(30),
                opened: true,
              },
            ],
          },
        ],
        isBasic: true,
        categoryId: 'category:dairy',
        expirationDate: plusDays(30),
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
            batches: [
              {
                batchId: 'batch:seed-salad-1',
                quantity: 0.2,
                unit: MeasurementUnit.KILOGRAM,
                expirationDate: minusDays(3),
                opened: true,
              },
            ],
          },
        ],
        categoryId: 'category:produce',
        expirationDate: minusDays(3),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    await this.storage.bulkSave(items);
    this.seeded = true;
  }
}
