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
        _id: 'item:sample-arroz',
        type: 'item',
        householdId: 'household:demo',
        name: 'Arroz blanco',
        stock: {
          quantity: 2,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
      });

      await this.storage.save({
        _id: 'item:sample-leche',
        type: 'item',
        householdId: 'household:demo',
        name: 'Leche entera',
        stock: {
          quantity: 6,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
      });

      await this.storage.save({
        _id: 'item:sample-huevos',
        type: 'item',
        householdId: 'household:demo',
        name: 'Huevos',
        stock: {
          quantity: 12,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.NORMAL,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(), // 2 semanas
      });

      await this.storage.save({
        _id: 'item:sample-manzanas',
        type: 'item',
        householdId: 'household:demo',
        name: 'Manzanas rojas',
        stock: {
          quantity: 1.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 días
      });

      await this.storage.save({
        _id: 'item:sample-pan',
        type: 'item',
        householdId: 'household:demo',
        name: 'Pan integral',
        stock: {
          quantity: 1,
          unit: MeasurementUnit.UNIT,
          status: StockStatus.LOW,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 días
      });

      await this.storage.save({
        _id: 'item:sample-aceite',
        type: 'item',
        householdId: 'household:demo',
        name: 'Aceite de oliva',
        stock: {
          quantity: 0.75,
          unit: MeasurementUnit.LITER,
          status: StockStatus.NORMAL,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 365).toISOString(), // 1 año
      });

      await this.storage.save({
        _id: 'item:sample-arandanos',
        type: 'item',
        householdId: 'household:demo',
        name: 'Arándanos',
        stock: {
          quantity: 0.5,
          unit: MeasurementUnit.KILOGRAM,
          status: StockStatus.NORMAL,
        },
        categoryId: '',
        locationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 semana
      });

    }

    this.seeded = true;
  }
}
