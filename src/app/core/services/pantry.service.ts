import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { PantryItem, ExpirationStatus } from '@core/models';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

@Injectable({
  providedIn: 'root'
})
export class PantryService extends StorageService<PantryItem> {
  private readonly TYPE = 'item';

  constructor() {
    super();
  }

  // 🔹 Create or update an item
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const newItem: PantryItem = {
      ...item,
      type: this.TYPE,
      householdId: item.householdId ?? DEFAULT_HOUSEHOLD_ID
    };
    return await this.upsert(newItem);
  }

  // 🔹 Retrieve every item
  async getAll(): Promise<PantryItem[]> {
    return await this.listByType(this.TYPE);
  }

  // 🔹 Items by location (kitchen, pantry, fridge…)
  async getByLocation(locationId: string): Promise<PantryItem[]> {
    return await this.findByField('locationId', locationId);
  }

  // 🔹 Items that need restocking
  async getLowStock(): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(i => i.stock?.minThreshold && i.stock?.quantity <= i.stock?.minThreshold);
  }

  // 🔹 Items close to expiring
  async getNearExpiry(daysAhead: number = 3): Promise<PantryItem[]> {
    const items = await this.getAll();
    const now = new Date();
    const limit = new Date();
    limit.setDate(now.getDate() + daysAhead);

    return items.filter(item => {
      if (!item.expirationDate) return false;
      const exp = new Date(item.expirationDate);
      return exp <= limit && exp > now;
    });
  }

  // 🔹 Calculate expiration status
  getExpirationStatus(item: PantryItem): ExpirationStatus {
    if (!item.expirationDate) return ExpirationStatus.OK;

    const now = new Date();
    const exp = new Date(item.expirationDate);
    const diff = exp.getTime() - now.getTime();
    const days = diff / (1000 * 3600 * 24);

    if (days < 0) return ExpirationStatus.EXPIRED;
    if (days <= 3) return ExpirationStatus.NEAR_EXPIRY;
    return ExpirationStatus.OK;
  }
}
