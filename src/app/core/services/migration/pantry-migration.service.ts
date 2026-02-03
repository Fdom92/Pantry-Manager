import { Injectable, inject } from '@angular/core';
import { MeasurementUnit } from '@core/models/shared';
import { normalizeLocationId, normalizeUnitValue } from '@core/utils/normalization.util';
import { PantryService } from '@core/services/pantry/pantry.service';
import type { ItemBatch } from '@core/models/pantry';
import type { LegacyLocationStock, LegacyPantryItem } from '@core/models/migration/legacy-pantry.model';

@Injectable({ providedIn: 'root' })
export class PantryMigrationService {
  private readonly pantryService = inject(PantryService);
  private readonly PAGE_SIZE = 200;
  private readonly MIGRATION_CHECK_KEY = 'pantry:migration:2.6';

  async migrateIfNeeded(): Promise<void> {
    if (!this.shouldCheckMigration()) {
      return;
    }
    const db = this.pantryService.getMigrationDatabase();
    const legacyItems: LegacyPantryItem[] = [];

    let skip = 0;
    while (true) {
      const res = await db.find({
        selector: { type: 'item' },
        skip,
        limit: this.PAGE_SIZE,
      });
      const docs = res.docs as LegacyPantryItem[];
      if (!docs.length) {
        break;
      }

      for (const item of docs) {
        if (this.shouldMigrate(item)) {
          legacyItems.push(item);
        }
      }

      if (docs.length < this.PAGE_SIZE) {
        break;
      }
      skip += docs.length;
    }

    if (!legacyItems.length) {
      this.markMigrationChecked();
      return;
    }

    try {
      await Promise.all(
        legacyItems.map(async item => {
          const legacyLocations = Array.isArray(item.locations) ? item.locations : [];
          const fallbackUnit = normalizeUnitValue(
            legacyLocations.find(location => Boolean(location?.unit))?.unit ?? MeasurementUnit.UNIT
          );
          const batches = this.migrateLegacyLocations(legacyLocations, fallbackUnit);
          const minThreshold = this.normalizeItemMinThreshold(item.minThreshold, legacyLocations);
          await this.pantryService.saveItem({
            ...(item as any),
            batches,
            minThreshold,
            locations: undefined,
          });
        })
      );
      this.markMigrationChecked();
    } catch (err) {
      console.error('[PantryMigrationService] migrateIfNeeded error', err);
    }
  }

  markMigrationCheckNeeded(): void {
    try {
      localStorage.setItem(this.MIGRATION_CHECK_KEY, 'true');
    } catch (err) {
      console.warn('[PantryMigrationService] markMigrationCheckNeeded failed', err);
    }
  }

  private shouldMigrate(item: LegacyPantryItem): boolean {
    const hasTaggedBatches =
      Array.isArray(item.batches) && item.batches.some(batch => Boolean((batch.locationId ?? '').trim()));
    if (hasTaggedBatches) {
      return false;
    }
    const legacyLocations = Array.isArray(item.locations) ? item.locations : [];
    return legacyLocations.some(location => {
      if (Array.isArray(location.batches) && location.batches.length > 0) {
        return true;
      }
      const legacyQuantity = this.toNumberOrZero((location as any).quantity);
      return legacyQuantity > 0;
    });
  }

  private migrateLegacyLocations(locations: LegacyLocationStock[], fallbackUnit: MeasurementUnit | string): ItemBatch[] {
    if (!Array.isArray(locations) || locations.length === 0) {
      return [];
    }

    const batches: ItemBatch[] = [];
    for (const location of locations) {
      if (!location) {
        continue;
      }
      const locationId = normalizeLocationId(location.locationId);
      const unit = normalizeUnitValue(location.unit ?? fallbackUnit);
      const legacyBatches = Array.isArray(location.batches) ? location.batches : [];
      for (const batch of legacyBatches) {
        batches.push({
          ...batch,
          quantity: this.toNumberOrZero(batch.quantity),
          unit: normalizeUnitValue(batch.unit ?? unit),
          opened: batch.opened ?? false,
          locationId,
        });
      }
      const legacyQuantity = this.toNumberOrZero((location as any).quantity);
      if (legacyQuantity > 0 && legacyBatches.length === 0) {
        batches.push({
          quantity: legacyQuantity,
          unit,
          opened: false,
          locationId,
        });
      }
    }

    return this.mergeBatchesByExpiry(batches);
  }

  private normalizeItemMinThreshold(
    itemMinThreshold: number | undefined,
    rawLocations: LegacyLocationStock[]
  ): number | undefined {
    const normalizedValue = this.toNumberOrUndefined(itemMinThreshold);
    if (normalizedValue != null) {
      return normalizedValue;
    }

    const legacyTotal = rawLocations.reduce((sum, location) => {
      const legacyMin = this.toNumberOrUndefined(location?.minThreshold);
      return sum + (legacyMin ?? 0);
    }, 0);

    return legacyTotal > 0 ? legacyTotal : undefined;
  }

  private mergeBatchesByExpiry(batches: ItemBatch[]): ItemBatch[] {
    if (!Array.isArray(batches) || batches.length <= 1) {
      return Array.isArray(batches) ? batches.map(batch => ({ ...batch })) : [];
    }

    const seen = new Map<string, ItemBatch>();
    const merged: ItemBatch[] = [];

    for (const batch of batches) {
      const expiryKey = (batch.expirationDate ?? '').trim();
      const locationKey = (batch.locationId ?? '').trim();
      const key = expiryKey ? `${locationKey}::${expiryKey}` : '';
      if (!key) {
        merged.push({ ...batch });
        continue;
      }

      const existing = seen.get(key);
      if (!existing) {
        const clone = { ...batch };
        seen.set(key, clone);
        merged.push(clone);
        continue;
      }

      existing.quantity = this.toNumberOrZero(existing.quantity) + this.toNumberOrZero(batch.quantity);
      existing.opened = Boolean(existing.opened || batch.opened);
    }

    return merged;
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

  private shouldCheckMigration(): boolean {
    try {
      const value = localStorage.getItem(this.MIGRATION_CHECK_KEY);
      return value !== 'false';
    } catch {
      return true;
    }
  }

  private markMigrationChecked(): void {
    try {
      localStorage.setItem(this.MIGRATION_CHECK_KEY, 'false');
    } catch (err) {
      console.warn('[PantryMigrationService] markMigrationChecked failed', err);
    }
  }
}
