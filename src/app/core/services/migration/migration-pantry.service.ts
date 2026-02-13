import { Injectable, inject } from '@angular/core';
import { mergeBatchesByExpiry } from '@core/domain/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import type { LegacyLocationStock, LegacyPantryItem } from '@core/models/migration/legacy-pantry.model';
import type { ItemBatch } from '@core/models/pantry';
import { PantryService } from '@core/services/pantry/pantry.service';
import { normalizeLocationId } from '@core/utils/normalization.util';
import { getBooleanFlag, setBooleanFlag } from '@core/utils/storage-flag.util';

@Injectable({ providedIn: 'root' })
export class MigrationPantryService {
  private readonly pantryService = inject(PantryService);
  private readonly PAGE_SIZE = 200;
  private readonly MIGRATION_CHECK_KEY = 'pantry:migration:2.6';

  async migrateIfNeeded(): Promise<void> {
    if (!getBooleanFlag(this.MIGRATION_CHECK_KEY, true)) {
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
      setBooleanFlag(this.MIGRATION_CHECK_KEY, false);
      return;
    }

    try {
      await Promise.all(
        legacyItems.map(async item => {
          const legacyLocations = this.getLegacyLocations(item);
          const batches = this.migrateLegacyLocations(legacyLocations);
          const minThreshold = this.normalizeItemMinThreshold(item.minThreshold, legacyLocations);
          await this.pantryService.saveItem({
            ...(item as any),
            batches,
            minThreshold,
            locations: undefined,
          });
        })
      );
      setBooleanFlag(this.MIGRATION_CHECK_KEY, false);
    } catch (err) {
      console.error('[MigrationPantryService] migrateIfNeeded error', err);
    }
  }

  markMigrationCheckNeeded(): void {
    setBooleanFlag(this.MIGRATION_CHECK_KEY, true);
  }

  private shouldMigrate(item: LegacyPantryItem): boolean {
    const hasTaggedBatches =
      Array.isArray(item.batches) && item.batches.some(batch => Boolean(normalizeLocationId(batch.locationId)));
    if (hasTaggedBatches) {
      return false;
    }
    const legacyLocations = this.getLegacyLocations(item);
    return legacyLocations.some(location => {
      const legacyBatches = this.getLegacyBatches(location);
      if (legacyBatches.length > 0) {
        return true;
      }
      const legacyQuantity = toNumberOrZero((location as any).quantity);
      return legacyQuantity > 0;
    });
  }

  private migrateLegacyLocations(locations: LegacyLocationStock[]): ItemBatch[] {
    if (!Array.isArray(locations) || locations.length === 0) {
      return [];
    }

    const batches: ItemBatch[] = [];
    for (const location of locations) {
      if (!location) {
        continue;
      }
      const locationId = normalizeLocationId(location.locationId);
      const legacyBatches = this.getLegacyBatches(location);
      for (const batch of legacyBatches) {
        batches.push({
          ...batch,
          quantity: toNumberOrZero(batch.quantity),
          opened: batch.opened ?? false,
          locationId,
        });
      }
      const legacyQuantity = toNumberOrZero((location as any).quantity);
      if (legacyQuantity > 0 && legacyBatches.length === 0) {
        batches.push({
          quantity: legacyQuantity,
          opened: false,
          locationId,
        });
      }
    }

    return mergeBatchesByExpiry(batches);
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

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (value == null || value === '') {
      return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private getLegacyLocations(item: LegacyPantryItem): LegacyLocationStock[] {
    return Array.isArray(item.locations) ? item.locations : [];
  }

  private getLegacyBatches(location: LegacyLocationStock | undefined): ItemBatch[] {
    return Array.isArray(location?.batches) ? location.batches : [];
  }

}
