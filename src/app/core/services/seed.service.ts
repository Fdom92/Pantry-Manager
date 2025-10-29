import { Injectable } from '@angular/core';
import { Item } from '@core/models/item.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class SeedService {
  private seeded = false;

  constructor(private storage: StorageService<Item>) {}

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
        quantity: 2,
        unit: 'kg',
        status: 'available',
        createdAt: now,
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 90).toISOString(),
      });

      await this.storage.save({
        _id: 'item:sample-leche',
        type: 'item',
        householdId: 'household:demo',
        name: 'Leche entera',
        quantity: 6,
        unit: 'u',
        status: 'low',
        createdAt: now,
        expirationDate: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(),
      });
    }

    this.seeded = true;
  }
}
