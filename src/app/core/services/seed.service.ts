import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { MeasurementUnit, PantryItem, StockStatus } from '@core/models';

@Injectable({ providedIn: 'root' })
export class SeedService {
  private seeded = false;

  constructor(private storage: StorageService<PantryItem>) {}

  async ensureSeedData(): Promise<void> {
    if (this.seeded) {
      return;
    }

    const existingItems = await this.storage.all('item');
    if (existingItems.length === 0) {
      const now = Date.now();

      await this.storage.save({
        _id: 'item:sample-rice',
        type: 'item',
        householdId: 'household:demo',
        name: 'White rice',
        stock: {
          quantity: 2,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.LOW,
          minThreshold: 3,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
      });

      await this.storage.save({
        _id: 'item:sample-milk',
        type: 'item',
        householdId: 'household:demo',
        name: 'Whole milk',
        stock: {
          quantity: 6,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 8,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
      });

      await this.storage.save({
        _id: 'item:sample-eggs',
        type: 'item',
        householdId: 'household:demo',
        name: 'Eggs',
        stock: {
          quantity: 12,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 18,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(), // 2 weeks
      });

      await this.storage.save({
        _id: 'item:sample-apples',
        type: 'item',
        householdId: 'household:demo',
        name: 'Red apples',
        stock: {
          quantity: 1.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
          minThreshold: 2,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 days
      });

      await this.storage.save({
        _id: 'item:sample-bread',
        type: 'item',
        householdId: 'household:demo',
        name: 'Whole grain bread',
        stock: {
          quantity: 1,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
          minThreshold: 2,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now - 1000 * 60 * 60 * 24).toISOString(), // expired yesterday
      });

      await this.storage.save({
        _id: 'item:sample-oil',
        type: 'item',
        householdId: 'household:demo',
        name: 'Olive oil',
        stock: {
          quantity: 0.75,
          unit: MeasurementUnit.LITER,
          status: StockStatus.LOW,
          minThreshold: 1,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 365).toISOString(), // 1 year
      });

      await this.storage.save({
        _id: 'item:sample-blueberries',
        type: 'item',
        householdId: 'household:demo',
        name: 'Blueberries',
        stock: {
          quantity: 0.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
          minThreshold: 0.8,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week
      });

      await this.storage.save({
        _id: 'item:sample-butter',
        type: 'item',
        householdId: 'household:demo',
        name: 'Butter',
        stock: {
          quantity: 0,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.EMPTY,
          minThreshold: 2,
          isBasic: true,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days
      });

      await this.storage.save({
        _id: 'item:sample-salad',
        type: 'item',
        householdId: 'household:demo',
        name: 'Mixed greens',
        stock: {
          quantity: 0.2,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.LOW,
          minThreshold: 0.8,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(), // expired 3 days ago
      });

    }

    this.seeded = true;
  }
}
