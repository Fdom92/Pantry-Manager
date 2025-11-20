import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { MeasurementUnit, PantryItem } from '@core/models';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

@Injectable({ providedIn: 'root' })
export class SeedService {
  private seeded = false;
  private readonly TARGET_QUANTITY = 120;
  private readonly categories = [
    'category:grains',
    'category:bakery',
    'category:dairy',
    'category:produce',
    'category:snacks',
    'category:pantry',
    'category:frozen',
  ];
  private readonly locations = ['pantry', 'kitchen', 'fridge', 'freezer', 'garage'];

  constructor(private storage: StorageService<PantryItem>) {}

  async ensureSeedData(): Promise<void> {
    if (this.seeded) return;

    const existing = await this.storage.all('item');
    if (existing.length >= this.TARGET_QUANTITY) {
      this.seeded = true;
      return;
    }

    const newItems = this.buildSeedItems(existing.length);
    if (newItems.length) {
      await this.storage.bulkSave(newItems);
    }
    this.seeded = true;
  }

  private buildSeedItems(offset: number): PantryItem[] {
    const now = Date.now();
    const DAY = 1000 * 60 * 60 * 24;
    const plusDays = (days: number) => new Date(now + DAY * days).toISOString();
    const minusDays = (days: number) => new Date(now - DAY * days).toISOString();

    const baseItems: PantryItem[] = [
      {
        _id: 'item:sample-rice',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'White rice',
        locations: [
          {
            locationId: 'pantry',
            unit: MeasurementUnit.KILOGRAM,
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
            unit: MeasurementUnit.KILOGRAM,
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
        minThreshold: 4,
        categoryId: 'category:grains',
        expirationDate: plusDays(30),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'item:sample-milk',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole milk',
        locations: [
          {
            locationId: 'fridge',
            unit: MeasurementUnit.UNIT,
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
        minThreshold: 8,
        categoryId: 'category:dairy',
        expirationDate: plusDays(7),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'item:sample-eggs',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Eggs',
        locations: [
          {
            locationId: 'fridge',
            unit: MeasurementUnit.UNIT,
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
        minThreshold: 18,
        categoryId: 'category:dairy',
        expirationDate: plusDays(14),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'item:sample-apples',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Red apples',
        locations: [
          {
            locationId: 'pantry',
            unit: MeasurementUnit.KILOGRAM,
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
            unit: MeasurementUnit.KILOGRAM,
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
        minThreshold: 3,
        categoryId: 'category:produce',
        expirationDate: plusDays(5),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'item:sample-bread',
        type: 'item',
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Whole grain bread',
        locations: [
          {
            locationId: 'pantry',
            unit: MeasurementUnit.UNIT,
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
        minThreshold: 2,
        categoryId: 'category:bakery',
        expirationDate: minusDays(1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const generatedItems: PantryItem[] = [];
    const remaining = Math.max(0, this.TARGET_QUANTITY - offset);
    for (let i = 0; i < remaining; i++) {
      const base = baseItems[i % baseItems.length];
      const index = offset + i + 1;
      generatedItems.push({
        ...base,
        _id: `${base._id}-${index}`,
        name: `${base.name} ${index}`,
        categoryId: this.categories[index % this.categories.length],
        locations: this.buildLocations(index),
        minThreshold: base.minThreshold ?? Math.floor(index % 5),
        createdAt: plusDays(-index),
        updatedAt: plusDays(-index + 1),
      });
    }
    return generatedItems;
  }

  private buildLocations(seed: number) {
    const locationCount = 1 + (seed % this.locations.length);
    return Array.from({ length: locationCount }).map((_, idx) => {
      const locationId = this.locations[(seed + idx) % this.locations.length];
      const unit =
        idx % 2 === 0 ? MeasurementUnit.UNIT : seed % 3 === 0 ? MeasurementUnit.KILOGRAM : MeasurementUnit.LITER;
      return {
        locationId,
        unit,
        batches: [
          {
            batchId: `batch:${seed}-${idx}-a`,
            quantity: idx + 1,
            unit,
            expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * (seed + idx)).toISOString(),
            opened: idx % 2 === 0,
          },
          {
            batchId: `batch:${seed}-${idx}-b`,
            quantity: idx + 2,
            unit,
            expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * (seed + idx + 5)).toISOString(),
          },
        ],
      };
    });
  }
}
