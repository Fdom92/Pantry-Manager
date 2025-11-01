import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { PantryItem, ExpirationStatus, ItemLocationStock, MeasurementUnit } from '@core/models';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

@Injectable({
  providedIn: 'root'
})
export class PantryService extends StorageService<PantryItem> {
  private readonly TYPE = 'item';
  private readonly NEAR_EXPIRY_WINDOW_DAYS = 3;

  constructor() {
    super();
  }

  /** Persist an item while normalizing legacy data into the multi-location format. */
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const normalized = this.normalizeItem({
      ...item,
      type: this.TYPE,
      householdId: item.householdId ?? DEFAULT_HOUSEHOLD_ID
    });
    return await this.upsert(normalized);
  }

  /** Fetch every pantry item, always returning normalized documents. */
  async getAll(): Promise<PantryItem[]> {
    const docs = await this.listByType(this.TYPE);
    return docs.map(doc => this.normalizeItem(doc));
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
    const now = new Date();
    const nearWindow = this.NEAR_EXPIRY_WINDOW_DAYS;
    for (const loc of item.locations) {
      if (!loc.expiryDate) continue;
      const exp = new Date(loc.expiryDate);
      if (this.isExpiredDate(exp, now)) {
        return ExpirationStatus.EXPIRED;
      }
      if (this.isNearExpiryDate(exp, now, nearWindow)) {
        return ExpirationStatus.NEAR_EXPIRY;
      }
    }
    return ExpirationStatus.OK;
  }

  async deleteItem(id: string): Promise<boolean> {
    return this.remove(id);
  }

  /** Backwards-compatible stock updater retained for existing consumers. */
  async updateStock(itemId: string, quantity: number, locationId?: string): Promise<PantryItem | null> {
    return this.updateLocationQuantity(itemId, quantity, locationId);
  }

  /**
   * Update the quantity for a specific location entry, creating a placeholder if needed,
   * and re-save the normalized document.
   */
  async updateLocationQuantity(itemId: string, quantity: number, locationId?: string): Promise<PantryItem | null> {
    const raw = await this.get(itemId);
    if (!raw) {
      return null;
    }

    const current = this.normalizeItem(raw);
    const targetId = locationId ?? current.locations[0]?.locationId;
    if (!targetId) {
      return null;
    }

    const nextLocations = this.ensureLocationArray(current.locations);
    const updatedLocations = nextLocations.map(loc =>
      loc.locationId === targetId
        ? { ...loc, quantity: Math.max(0, quantity) }
        : loc
    );

    const updated: PantryItem = {
      ...current,
      locations: updatedLocations
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

  /** Subscribe to live-updates while ensuring consumers always see normalized payloads. */
  watchPantryChanges(onChange: (item: PantryItem) => void) {
    return this.watchChanges(doc => {
      if (doc.type === this.TYPE) {
        onChange(this.normalizeItem(doc));
      }
    });
  }

  /** --- Public helpers for store/UI logic reuse --- */
  /** Check whether the combined stock across locations is considered low. */
  isItemLowStock(item: PantryItem): boolean {
    return this.isLowStock(item);
  }

  /** Determine if any location expires within the provided rolling window. */
  isItemNearExpiry(item: PantryItem, daysAhead: number = this.NEAR_EXPIRY_WINDOW_DAYS): boolean {
    return this.isNearExpiry(item, daysAhead);
  }

  /** Determine if at least one location has already expired. */
  isItemExpired(item: PantryItem): boolean {
    return this.isExpired(item);
  }

  /** Sum every location quantity into a single figure. */
  getItemTotalQuantity(item: PantryItem): number {
    return item.locations.reduce((sum, loc) => sum + (Number(loc.quantity) || 0), 0);
  }

  /** Sum the minimum thresholds defined at each location. */
  getItemTotalMinThreshold(item: PantryItem): number {
    return item.locations.reduce(
      (sum, loc) => sum + (loc.minThreshold != null ? Number(loc.minThreshold) : 0),
      0
    );
  }

  /** Return the earliest expiry date among the defined locations. */
  getItemEarliestExpiry(item: PantryItem): string | undefined {
    return this.computeEarliestExpiry(item.locations);
  }

  /** Normalize a raw storage document, handling legacy single-location fields. */
  private normalizeItem(raw: any): PantryItem {
    const {
      locationId,
      stock,
      locations,
      isBasic,
      expirationDate,
      expirationStatus,
      ...rest
    } = raw ?? {};

    const normalizedLocations = this.normalizeLocations(
      Array.isArray(locations) ? locations : undefined,
      locationId,
      stock,
      expirationDate
    );

    const earliestExpiry = this.computeEarliestExpiry(normalizedLocations);
    const computedExpirationStatus = this.computeExpirationStatus(normalizedLocations);

    const base: PantryItem = {
      ...rest,
      householdId: rest?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      type: rest?.type ?? this.TYPE,
      locations: normalizedLocations,
      isBasic: isBasic ?? stock?.isBasic ?? undefined,
      expirationDate: earliestExpiry ?? expirationDate,
      expirationStatus: computedExpirationStatus ?? expirationStatus ?? ExpirationStatus.OK,
    };

    return base;
  }

  /**
   * Translate legacy stock and location fields into the new array-of-locations structure.
   * Creates a default entry when the document predates the migration.
   */
  private normalizeLocations(
    rawLocations: ItemLocationStock[] | undefined,
    legacyLocationId?: string,
    legacyStock?: { quantity?: number; unit?: MeasurementUnit; minThreshold?: number; expiryDate?: string; },
    legacyExpirationDate?: string
  ): ItemLocationStock[] {
    if (rawLocations && rawLocations.length) {
      return rawLocations.map(loc => this.normalizeLocationEntry(loc));
    }

    const locationId = legacyLocationId ?? 'unassigned';
    const quantity = legacyStock?.quantity ?? 0;
    const unit = legacyStock?.unit ?? MeasurementUnit.UNIT;
    const minThreshold = legacyStock?.minThreshold;
    const expiryDate = (legacyStock as any)?.expiryDate ?? legacyExpirationDate;

    return [
      this.normalizeLocationEntry({
        locationId,
        quantity,
        unit,
        minThreshold,
        expiryDate,
      })
    ];
  }

  /** Ensure each location entry has consistent types and defaults. */
  private normalizeLocationEntry(location: Partial<ItemLocationStock>): ItemLocationStock {
    return {
      locationId: location.locationId ?? 'unassigned',
      quantity: Number.isFinite(location.quantity as number) ? Number(location.quantity) : 0,
      unit: location.unit ?? MeasurementUnit.UNIT,
      minThreshold: location.minThreshold != null ? Number(location.minThreshold) : undefined,
      expiryDate: location.expiryDate,
      opened: typeof location.opened === 'boolean' ? location.opened : undefined,
    };
  }

  /** Identify the earliest expiry date across all location entries. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    const validDates = locations
      .map(loc => loc.expiryDate)
      .filter((date): date is string => Boolean(date));
    if (!validDates.length) {
      return undefined;
    }
    const earliest = validDates.reduce((min, current) => {
      if (!min) return current;
      return new Date(current) < new Date(min) ? current : min;
    });
    return earliest;
  }

  /** Project a high-level expiration status based on per-location dates. */
  private computeExpirationStatus(locations: ItemLocationStock[]): ExpirationStatus {
    const now = new Date();
    const windowDays = this.NEAR_EXPIRY_WINDOW_DAYS;
    let nearest: ExpirationStatus = ExpirationStatus.OK;

    for (const loc of locations) {
      if (!loc.expiryDate) continue;
      const exp = new Date(loc.expiryDate);
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
    if (!item.locations.length) {
      return true;
    }
    const totalQuantity = item.locations.reduce((sum, loc) => sum + (Number(loc.quantity) || 0), 0);
    const totalMinThreshold = item.locations.reduce(
      (sum, loc) => sum + (loc.minThreshold != null ? Number(loc.minThreshold) : 0),
      0
    );
    if (totalMinThreshold <= 0) {
      return false;
    }
    return totalQuantity <= totalMinThreshold;
  }

  /** Internal near-expiry detector that checks every location. */
  private isNearExpiry(item: PantryItem, daysAhead: number = this.NEAR_EXPIRY_WINDOW_DAYS): boolean {
    const now = new Date();
    return item.locations.some(loc => {
      if (!loc.expiryDate) return false;
      const exp = new Date(loc.expiryDate);
      return !this.isExpiredDate(exp, now) && this.isNearExpiryDate(exp, now, daysAhead);
    });
  }

  /** Internal expired detector that checks every location. */
  private isExpired(item: PantryItem): boolean {
    const now = new Date();
    return item.locations.some(loc => {
      if (!loc.expiryDate) return false;
      const exp = new Date(loc.expiryDate);
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

  /** Guarantee that we always have at least one normalized location. */
  private ensureLocationArray(locations: ItemLocationStock[]): ItemLocationStock[] {
    if (locations.length) {
      return locations.map(loc => this.normalizeLocationEntry(loc));
    }
    return [this.normalizeLocationEntry({ locationId: 'unassigned', quantity: 0, unit: MeasurementUnit.UNIT })];
  }
}
