import { Injectable, inject } from '@angular/core';
import { buildAddItemPayload, FRESH_QTY } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { createDocumentId, withSignalFlag } from '@core/utils';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../../analytics/analytics.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';
import { PantryAddEntriesBase } from './pantry-add-entries-base';

/**
 * The fresco add sheet. Same entry engine as the despensa one, drawing from the
 * fresh half of the catalogue, and saving as a state rather than a count: a
 * fresh product is had ("Suficiente") or not had.
 */
@Injectable()
export class PantryFreshAddModalStateService extends PantryAddEntriesBase {
  private readonly toast = inject(ToastService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);

  protected readonly idPrefix = 'fresh';

  protected belongsToCatalogue(item: PantryItem): boolean {
    return item.productType === 'fresh';
  }

  /** You either have lettuce or you do not, so a second pick changes nothing. */
  protected onRepeatedPick(entries: AddEntry[]): AddEntry[] {
    return entries;
  }

  /**
   * Restocking a fresh product means a new lettuce, not the old one, so it gets
   * a fresh suggested date rather than inheriting the batch's.
   */
  protected decorateEntry(name: string, item?: PantryItem): Partial<AddEntry> {
    return this.suggestedExpiryFor(name, item);
  }

  open(): void {
    this.openSheet();
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_FRESH_ADD_MODAL_OPENED);
  }

  close(): void {
    this.closeSheet();
  }

  /**
   * Each entry is materialised as:
   * - new → a PantryItem with productType='fresh' and a single batch at
   *   "Suficiente", carrying whatever date the row shows.
   * - existing → its single batch is overwritten, keeping the convention that a
   *   fresh product has exactly one lot rather than a stack of them.
   */
  async submit(): Promise<void> {
    if (this.isSubmitting()) return;
    const entries = this.submittableEntries();
    if (!entries.length) return;

    await withSignalFlag(this.isSubmitting, async () => {
      const sessionId = entries.length > 1 ? createDocumentId('session') : undefined;

      for (const entry of entries) {
        const timestamp = new Date().toISOString();

        if (entry.isNew || !entry.item) {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: FRESH_QTY.sufficient,
            expirationDate: entry.expirationDate,
            noExpiry: entry.noExpiry,
            // The row already shows a suggested date, so the builder must save
            // what is on screen. Without this, clearing the date in the sheet
            // silently brought an inferred one back on save.
            inferExpiry: false,
          });
          const freshItem: PantryItem = {
            ...base,
            productType: 'fresh',
            minThreshold: undefined,
            isBasic: false,
          };
          await this.pantryStore.addItem(freshItem);
          await this.eventManager.logAddNewItem(freshItem, 3, sessionId, timestamp);
          this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
            kind: 'fresh',
            source: 'fresh_add_modal',
            is_new: true,
            quantity: FRESH_QTY.sufficient,
            has_expiry: Boolean(entry.expirationDate),
          });
          continue;
        }

        const existing = entry.item;
        const previousBatch = existing.batches?.[0];
        const updatedBatch = {
          batchId: previousBatch?.batchId ?? `batch-${Date.now()}`,
          quantity: FRESH_QTY.sufficient,
          expirationDate: entry.expirationDate ?? previousBatch?.expirationDate,
          noExpiry: entry.noExpiry ?? previousBatch?.noExpiry,
          opened: previousBatch?.opened,
          locationId: previousBatch?.locationId,
        };
        const updated: PantryItem = {
          ...existing,
          batches: [updatedBatch],
          minThreshold: existing.minThreshold,
          updatedAt: timestamp,
        };
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAddExistingItem(existing, updated, 3, entry.expirationDate, sessionId, timestamp);
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
          kind: 'fresh',
          source: 'fresh_add_modal',
          is_new: false,
          quantity: FRESH_QTY.sufficient,
          has_expiry: Boolean(entry.expirationDate),
        });
      }
      this.dismiss();
      if (entries.length === 1) {
        this.toast.success('pantry.fresh.toast.addSuccess_one', { name: entries[0].name });
      } else {
        this.toast.success('pantry.fresh.toast.addSuccess_other', { count: entries.length });
      }
    }).catch(err => this.logger.error('PantryFreshAddModalStateService', 'submit error', err));
  }
}
