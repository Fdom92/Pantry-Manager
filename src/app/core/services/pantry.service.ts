import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { PantryItem, ExpirationStatus, ItemLocationStock, MeasurementUnit, ItemBatch } from '@core/models';
import { DEFAULT_HOUSEHOLD_ID, NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';

@Injectable({
  providedIn: 'root'
})
export class PantryService extends StorageService<PantryItem> {
  private readonly TYPE = 'item';

  constructor() {
    super();
  }

  /** Persist an item ensuring aggregate fields (type, household, expirations) stay in sync. */
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const prepared = this.applyDerivedFields({
      ...item,
      type: this.TYPE,
      householdId: item.householdId ?? DEFAULT_HOUSEHOLD_ID,
    });
    return await this.upsert(prepared);
  }

  /** Fetch every pantry item, computing aggregate fields directly from stored data. */
  async getAll(): Promise<PantryItem[]> {
    const docs = await this.listByType(this.TYPE);
    return docs.map(doc => this.applyDerivedFields(doc));
  }

  /** Return items that currently have stock in the requested location. */
  async getByLocation(locationId: string): Promise<PantryItem[]> {
    const all = await this.getAll();
    return all.filter(item =>
      item.locations.some(loc => loc.locationId === locationId)
    );
  }

  /** Retrieve items whose aggregated quantity is at or below the configured threshold. */
  async getLowStock(): Promise<PantryItem[]> {
    const items = await this.getAll();
  	return items.filter(item => this.isLowStock(item));
  }

  /** Retrieve items that have at least one location expiring within the provided window. */
  async getNearExpiry(daysAhead: number = 3): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => this.isNearExpiry(item, daysAhead));
  }

  /** Compute the overall expiration status based on the most urgent location expiry. */
  getExpirationStatus(item: PantryItem): ExpirationStatus {
    if (!item.locations.length) {
      return ExpirationStatus.OK;
    }
    return this.computeExpirationStatus(item.locations);
  }

  async deleteItem(id: string): Promise<boolean> {
    return this.remove(id);
  }

  /**
   * Update the quantity for a specific location entry, creating a placeholder if needed,
   * and then persist the refreshed document.
   */
  async updateLocationQuantity(itemId: string, quantity: number, locationId?: string): Promise<PantryItem | null> {
    const current = await this.get(itemId);
    if (!current) {
      return null;
    }

    const locations = [...(current.locations ?? [])];
    const targetId = locationId ?? locations[0]?.locationId;
    if (!targetId) {
      return null;
    }

    let handled = false;
    const nextLocations = locations.map(loc => {
      if (loc.locationId === targetId) {
        handled = true;
        const unit = loc.unit ?? MeasurementUnit.UNIT;
        const sanitizedBatches = this.normalizeBatches(loc.batches, unit);
        const nextTotal = Math.max(0, quantity);
        const adjustedBatches = this.applyQuantityDeltaToBatches(sanitizedBatches, nextTotal, unit);
        return {
          ...loc,
          unit,
          batches: adjustedBatches,
        };
      }
      return loc;
    });

    if (!handled) {
      const unit = locations[0]?.unit ?? MeasurementUnit.UNIT;
      const nextTotal = Math.max(0, quantity);
      nextLocations.push({
        locationId: targetId,
        unit,
        batches: this.applyQuantityDeltaToBatches([], nextTotal, unit),
      });
    }

    const updated: PantryItem = {
      ...current,
      locations: nextLocations,
    };

    return this.saveItem(updated);
  }

  /** Retrieve items that already have an expired location. */
  async getExpired(): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => this.isExpired(item));
  }

  /** Build a quick aggregate for dashboards without forcing callers to re-implement loops. */
  async getSummary(): Promise<{
    total: number;
    expired: number;
    nearExpiry: number;
    lowStock: number;
  }> {
    const items = await this.getAll();

    let expired = 0, nearExpiry = 0, lowStock = 0;

    for (const item of items) {
      if (this.isExpired(item)) {
        expired += 1;
      } else if (this.isNearExpiry(item)) {
        nearExpiry += 1;
      }
      if (this.isLowStock(item)) {
        lowStock += 1;
      }
    }

    return {
      total: items.length,
      expired,
      nearExpiry,
      lowStock
    };
  }

  /** Subscribe to live-updates while ensuring consumers always see consistent payloads. */
  watchPantryChanges(onChange: (item: PantryItem) => void) {
    return this.watchChanges(doc => {
      if (doc.type === this.TYPE) {
        onChange(this.applyDerivedFields(doc));
      }
    });
  }

  /** --- Public helpers for store/UI logic reuse --- */
  /** Check whether the combined stock across locations is considered low. */
  isItemLowStock(item: PantryItem): boolean {
    return this.isLowStock(item);
  }

  /** Determine if any location expires within the provided rolling window. */
  isItemNearExpiry(item: PantryItem, daysAhead: number = NEAR_EXPIRY_WINDOW_DAYS): boolean {
    return this.isNearExpiry(item, daysAhead);
  }

  /** Determine if at least one location has already expired. */
  isItemExpired(item: PantryItem): boolean {
    return this.isExpired(item);
  }

  /** Sum every location quantity into a single figure. */
  getItemTotalQuantity(item: PantryItem): number {
    return item.locations.reduce((sum, loc) => sum + this.getLocationQuantity(loc), 0);
  }

  /** Sum the minimum thresholds defined at each location. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return item.locations.reduce(
      (sum, loc) => sum + (this.toNumberOrUndefined(loc.minThreshold) ?? 0),
      0
    );
  }

  /** Return the earliest expiry date among the defined locations. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return this.computeEarliestExpiry(item.locations);
  }

  /** Total quantity stored for a specific location id. */
  getItemQuantityByLocation(item: PantryItem, locationId: string): number {
    const target = (locationId ?? '').trim();
    if (!target) {
      return 0;
    }
    return item.locations
      .filter(loc => (loc.locationId ?? '').trim() === target)
      .reduce((sum, loc) => sum + this.getLocationQuantity(loc), 0);
  }

  /** Return all batches currently tracked for the provided item. */
  getItemBatches(item: PantryItem): ItemBatch[] {
    return this.collectBatches(item.locations);
  }

  /** Determine whether any batch in the item is marked as opened. */
  hasOpenBatch(item: PantryItem): boolean {
    return this.collectBatches(item.locations).some(batch => Boolean(batch.opened));
  }

  /** Compute aggregate fields without mutating the original payload. */
  private applyDerivedFields(item: PantryItem): PantryItem {
    const locations = this.normalizeLocations(item.locations);
    const supermarket = this.normalizeSupermarketName(
      (item.supermarket ?? (item as any).supermarketId) as string | undefined
    );
    const prepared: PantryItem = {
      ...item,
      supermarket,
      locations,
      expirationDate: this.computeEarliestExpiry(locations),
      expirationStatus: this.computeExpirationStatus(locations),
    };
    delete (prepared as any).supermarketId;
    return prepared;
  }

  private normalizeSupermarketName(raw?: string | null): string | undefined {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      return undefined;
    }
    const normalizedWhitespace = trimmed.replace(/\s+/g, ' ');
    const lower = normalizedWhitespace.toLowerCase();
    return lower.replace(/\b\w/g, char => char.toUpperCase());
  }

  private normalizeLocations(locations?: ItemLocationStock[]): ItemLocationStock[] {
    const raw = Array.isArray(locations) ? locations.filter(Boolean) : [];
    const normalized = raw
      .map(location => this.normalizeLocation(location))
      .filter((loc): loc is ItemLocationStock => Boolean((loc.locationId ?? '').trim()));

    if (!normalized.length) {
      return [
        {
          locationId: 'unassigned',
          unit: MeasurementUnit.UNIT,
          minThreshold: undefined,
          batches: [],
        },
      ];
    }

    return normalized;
  }

  private normalizeLocation(location: ItemLocationStock): ItemLocationStock {
    const unit = location.unit ?? MeasurementUnit.UNIT;
    const locationId = (location.locationId ?? 'unassigned').trim() || 'unassigned';
    const minThreshold = this.toNumberOrUndefined(location.minThreshold);
    const batches = this.normalizeBatches(location.batches, unit);
    const legacyQuantity = this.toNumberOrZero((location as any).quantity);
    const totalBatchQuantity = this.sumBatchQuantities(batches);

    if (legacyQuantity > 0 && totalBatchQuantity === 0) {
      batches.push({
        batchId: this.generateBatchId(),
        quantity: legacyQuantity,
        unit,
        opened: false,
      });
    }

    return {
      locationId,
      unit,
      minThreshold,
      batches,
    };
  }

  private normalizeBatches(batches: ItemBatch[] | undefined, fallbackUnit: MeasurementUnit): ItemBatch[] {
    if (!Array.isArray(batches) || !batches.length) {
      return [];
    }

    return batches.map(batch => ({
      ...batch,
      batchId: batch.batchId ?? this.generateBatchId(),
      quantity: this.toNumberOrZero(batch.quantity),
      unit: batch.unit ?? fallbackUnit,
      opened: batch.opened ?? false,
    }));
  }

  /** Identify the earliest expiry date across all location entries. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    const dates = this.collectBatches(locations)
      .map(batch => batch.expirationDate)
      .filter((date): date is string => Boolean(date));
    if (dates.length === 0) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
  }

  /** Project a high-level expiration status based on per-location dates. */
  private computeExpirationStatus(locations: ItemLocationStock[]): ExpirationStatus {
    const now = new Date();
    const windowDays = NEAR_EXPIRY_WINDOW_DAYS;
    let nearest: ExpirationStatus = ExpirationStatus.OK;

    for (const batch of this.collectBatches(locations)) {
      if (!batch.expirationDate) {
        continue;
      }
      const exp = new Date(batch.expirationDate);
      if (this.isExpiredDate(exp, now)) {
        return ExpirationStatus.EXPIRED;
      }
      if (nearest !== ExpirationStatus.NEAR_EXPIRY && this.isNearExpiryDate(exp, now, windowDays)) {
        nearest = ExpirationStatus.NEAR_EXPIRY;
      }
    }

    return nearest;
  }

  /** Internal low-stock detector that considers the sum of all locations. */
  private isLowStock(item: PantryItem): boolean {
    const totalMinThreshold = this.getItemTotalMinThreshold(item);
    if (totalMinThreshold <= 0) {
      return false;
    }
    return this.getItemTotalQuantity(item) <= totalMinThreshold;
  }

  /** Internal near-expiry detector that checks every location. */
  private isNearExpiry(item: PantryItem, daysAhead: number = NEAR_EXPIRY_WINDOW_DAYS): boolean {
    const now = new Date();
    return this.collectBatches(item.locations).some(batch => {
      if (!batch.expirationDate) return false;
      const exp = new Date(batch.expirationDate);
      return !this.isExpiredDate(exp, now) && this.isNearExpiryDate(exp, now, daysAhead);
    });
  }

  /** Internal expired detector that checks every location. */
  private isExpired(item: PantryItem): boolean {
    const now = new Date();
    return this.collectBatches(item.locations).some(batch => {
      if (!batch.expirationDate) return false;
      const exp = new Date(batch.expirationDate);
      return this.isExpiredDate(exp, now);
    });
  }

  private isExpiredDate(expiration: Date, reference: Date): boolean {
    const exp = new Date(expiration);
    exp.setHours(0, 0, 0, 0);
    const ref = new Date(reference);
    ref.setHours(0, 0, 0, 0);
    return exp < ref;
  }

  /** Evaluate whether an expiry is within the provided window starting from today. */
  private isNearExpiryDate(expiration: Date, reference: Date, windowDays: number): boolean {
    const exp = new Date(expiration);
    exp.setHours(0, 0, 0, 0);
    const ref = new Date(reference);
    ref.setHours(0, 0, 0, 0);
    const diff = exp.getTime() - ref.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= windowDays;
  }

  private collectBatches(locations: ItemLocationStock[]): ItemBatch[] {
    const batches: ItemBatch[] = [];
    for (const location of locations) {
      if (!Array.isArray(location.batches)) {
        continue;
      }
      for (const batch of location.batches) {
        batches.push({
          ...batch,
          quantity: this.toNumberOrZero(batch.quantity),
          unit: batch.unit ?? location.unit,
          batchId: batch.batchId ?? this.generateBatchId(),
          opened: batch.opened ?? false,
        });
      }
    }
    return batches;
  }

  private sumBatchQuantities(batches: ItemBatch[] | undefined): number {
    if (!Array.isArray(batches) || !batches.length) {
      return 0;
    }
    return batches.reduce((sum, batch) => sum + this.toNumberOrZero(batch.quantity), 0);
  }

  private applyQuantityDeltaToBatches(batches: ItemBatch[], nextTotal: number, fallbackUnit: MeasurementUnit): ItemBatch[] {
    const sanitized: ItemBatch[] = batches.map(batch => ({
      ...batch,
      quantity: this.toNumberOrZero(batch.quantity),
      unit: batch.unit ?? fallbackUnit,
    }));
    const currentTotal = this.sumBatchQuantities(sanitized);
    const target = this.toNumberOrZero(nextTotal);

    if (target <= 0) {
      return [];
    }

    if (Math.abs(target - currentTotal) < 1e-9) {
      return sanitized;
    }

    if (currentTotal === 0) {
      return [
        {
          batchId: this.generateBatchId(),
          quantity: target,
          unit: fallbackUnit,
          opened: false,
        },
      ];
    }

    let delta = target - currentTotal;
    const adjusted = sanitized.map(batch => ({ ...batch }));

    if (delta > 0) {
      if (!adjusted.length) {
        adjusted.push({
          batchId: this.generateBatchId(),
          quantity: target,
          unit: fallbackUnit,
          opened: false,
        });
      } else {
        adjusted[0].quantity = this.toNumberOrZero(adjusted[0].quantity) + delta;
      }
      return adjusted;
    }

    delta = Math.abs(delta);
    for (let i = adjusted.length - 1; i >= 0 && delta > 0; i--) {
      const batchQty = this.toNumberOrZero(adjusted[i].quantity);
      if (batchQty <= delta + 1e-9) {
        delta -= batchQty;
        adjusted.splice(i, 1);
      } else {
        adjusted[i].quantity = batchQty - delta;
        delta = 0;
      }
    }

    if (delta > 0) {
      return [];
    }

    return adjusted;
  }

  private getLocationQuantity(location: ItemLocationStock): number {
    if (!Array.isArray(location.batches) || location.batches.length === 0) {
      return 0;
    }
    return location.batches.reduce((sum, batch) => sum + this.toNumberOrZero(batch.quantity), 0);
  }

  private toNumberOrZero(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (value == null || value === '') {
      return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private generateBatchId(): string {
    return `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
