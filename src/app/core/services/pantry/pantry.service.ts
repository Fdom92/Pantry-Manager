import { Injectable } from '@angular/core';
import { DEFAULT_HOUSEHOLD_ID, NEAR_EXPIRY_WINDOW_DAYS, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import {
  computeEarliestExpiry as computeEarliestExpiryStock,
  computeExpirationStatus as computeExpirationStatusItem,
  getItemStatusState,
  mergeBatchesByExpiry as mergeBatchesByExpiryStock,
  normalizeBatches as normalizeBatchesStock,
  sumQuantities as sumQuantitiesStock,
} from '@core/domain/pantry';
import { toNumberOrZero as toNumberOrZeroStock } from '@core/utils/formatting.util';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { normalizeLocationId, normalizeSupermarketName, normalizeTrim } from '@core/utils/normalization.util';
import { generateBatchId } from '@core/utils';
import { StorageService } from '../shared/storage.service';

/**
 * PouchDB persistence layer for pantry items.
 *
 * Responsibilities:
 *  - CRUD: saveItem, getAll, getAllActive, deleteItem, addNewLot, getSummary
 *  - Paginated reads: getPaginatedProducts
 *  - Live-change feed: watchPantryChanges
 *  - Derived-field computation: applyDerivedFields (called on every read/write)
 *  - DB warmup / index management: initialize
 *
 * Not responsible for:
 *  - Reactive signals or in-memory cache → PantryQueryService
 *  - Pagination/filter/search state → PantryQueryService
 *  - Navigation presets → PantryNavigationPresetService
 */
@Injectable({ providedIn: 'root' })
export class PantryService extends StorageService<PantryItem> {
  private readonly TYPE = 'item';
  private readonly PRODUCT_INDEX_FIELDS: string[] = ['type'];
  private dbPreloaded = false;
  private productIndexReady = false;

  /**
   * Warms up the database during bootstrap to eliminate the initial lag and
   * ensures the index required by paginated queries is available.
   */
  async initialize(): Promise<void> {
    if (this.dbPreloaded) return;
    this.dbPreloaded = true;
    try {
      await this.database.info();
      await this.ensureProductIndex();
    } catch (err) {
      console.warn('[PantryService] Database warmup failed', err);
      this.dbPreloaded = false;
    }
  }

  /** Returns the total number of pantry items stored in PouchDB. */
  async getTotalCount(): Promise<number> {
    try {
      return await this.countByType(this.TYPE);
    } catch (err) {
      console.warn('[PantryService] Failed to count items', err);
      return 0;
    }
  }

  /**
   * Fetches a page of normalized products using skip/limit.
   * Pagination state is managed by PantryQueryService.
   */
  async getPaginatedProducts(offset: number, limit: number): Promise<PantryItem[]> {
    if (limit <= 0) return [];
    await this.ensureProductIndex();
    const response = await this.database.find({
      selector: { type: this.TYPE },
      skip: Math.max(0, offset),
      limit,
    });
    return response.docs.map(doc => this.applyDerivedFields(doc));
  }

  /**
   * Persist an item ensuring aggregate fields (type, household, expirations) stay in sync.
   * Returns the normalized saved item — does NOT update any reactive cache.
   */
  async saveItem(item: PantryItem): Promise<PantryItem> {
    const prepared = this.applyDerivedFields({
      ...item,
      type: this.TYPE,
      householdId: item.householdId ?? DEFAULT_HOUSEHOLD_ID,
    });
    const saved = await this.upsert(prepared);
    return this.applyDerivedFields(saved);
  }

  /** Fetch every pantry item, computing aggregate fields directly from stored data. */
  async getAll(): Promise<PantryItem[]> {
    const docs = await this.all(this.TYPE);
    return docs.map(doc => this.applyDerivedFields(doc));
  }

  /** Fetch every pantry item that currently has stock. */
  async getAllActive(): Promise<PantryItem[]> {
    const items = await this.getAll();
    return items.filter(item => sumQuantitiesStock(item.batches ?? []) > 0);
  }

  /** Remove an item from PouchDB. Returns true when the deletion succeeded. */
  async deleteItem(id: string): Promise<boolean> {
    return this.remove(id);
  }

  /**
   * Append a brand new batch to the requested product without altering other batches.
   * If a location is provided it will be normalized and stored on the batch.
   */
  async addNewLot(
    productId: string,
    lot: { quantity: number; expiryDate?: string | null; location?: string; noExpiry?: boolean }
  ): Promise<PantryItem | null> {
    const item = await this.get(productId);
    if (!item) return null;

    const current = this.applyDerivedFields(item);
    const quantity = toNumberOrZeroStock(lot?.quantity);
    if (quantity <= 0) return current;

    const rawLocation = normalizeTrim(lot?.location);
    const locationId = rawLocation
      ? normalizeLocationId(rawLocation, UNASSIGNED_LOCATION_KEY)
      : undefined;

    const newBatch: ItemBatch = {
      batchId: generateBatchId(),
      quantity,
      expirationDate: lot?.expiryDate ?? undefined,
      noExpiry: lot.noExpiry || undefined,
      opened: false,
      locationId,
    };

    return this.saveItem({
      ...current,
      batches: mergeBatchesByExpiryStock([...(current.batches ?? []), newBatch]),
    });
  }

  /** Build a quick aggregate for dashboards without forcing callers to re-implement loops. */
  async getSummary(): Promise<{
    total: number;
    expired: number;
    nearExpiry: number;
    lowStock: number;
  }> {
    const items = await this.getAllActive();
    const now = new Date();
    let expired = 0, nearExpiry = 0, lowStock = 0;

    for (const item of items) {
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      switch (state) {
        case 'expired':    expired += 1;    break;
        case 'near-expiry': nearExpiry += 1; break;
        case 'low-stock':  lowStock += 1;   break;
      }
    }

    return { total: items.length, expired, nearExpiry, lowStock };
  }

  /**
   * Subscribe to live PouchDB changes, firing with normalized items.
   * Cache updates are handled by PantryQueryService which wraps this method.
   */
  watchPantryChanges(
    onChange: (item: PantryItem | null, meta?: { deleted?: boolean; id: string }) => void
  ) {
    return this.watchChanges(doc => {
      if (doc.type !== this.TYPE) return;
      const deleted = (doc as any)._deleted === true;
      if (deleted) {
        onChange(null, { deleted: true, id: doc._id });
        return;
      }
      onChange(this.applyDerivedFields(doc), { id: doc._id });
    });
  }

  getMigrationDatabase(): PouchDB.Database<PantryItem> {
    return this.database;
  }

  /** Compute aggregate fields without mutating the original payload. */
  private applyDerivedFields(item: PantryItem): PantryItem {
    const rawBatches = Array.isArray(item.batches) ? item.batches : [];
    const batches = normalizeBatchesStock(rawBatches, { generateBatchId });
    const supermarket = normalizeSupermarketName(
      (item.supermarket ?? (item as any).supermarketId) as string | undefined
    );
    const rawMinThreshold = item.minThreshold;
    const minThreshold =
      rawMinThreshold == null || (typeof rawMinThreshold === 'string' && rawMinThreshold === '')
        ? undefined
        : Number.isFinite(Number(rawMinThreshold))
          ? Number(rawMinThreshold)
          : undefined;
    const prepared: PantryItem = {
      ...item,
      supermarket,
      batches,
      minThreshold,
      expirationDate: computeEarliestExpiryStock(batches),
      expirationStatus: computeExpirationStatusItem(batches, new Date(), NEAR_EXPIRY_WINDOW_DAYS),
    };
    delete (prepared as any).supermarketId;
    delete (prepared as any).locations;
    return prepared;
  }

  private async ensureProductIndex(): Promise<void> {
    if (this.productIndexReady) return;
    await this.ensureIndex(this.PRODUCT_INDEX_FIELDS);
    this.productIndexReady = true;
  }
}
