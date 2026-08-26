import { Injectable, inject } from '@angular/core';
import { buildAddItemPayload } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { createDocumentId, withSignalFlag } from '@core/utils';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../../analytics/analytics.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';
import { PantryAddEntriesBase } from './pantry-add-entries-base';

/**
 * The despensa add sheet. Same entry engine as the fresco one, drawing from the
 * non-fresh half of the catalogue, and saving each entry as a new lot with its
 * own count and expiry.
 */
@Injectable()
export class PantryAddModalStateService extends PantryAddEntriesBase {
  private readonly toast = inject(ToastService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);

  protected readonly idPrefix = 'add';

  /** Legacy items without a productType count as despensa by convention. */
  protected belongsToCatalogue(item: PantryItem): boolean {
    return item.productType !== 'fresh';
  }

  /** A second tin of tomatoes is a second tin, so the count goes up. */
  protected onRepeatedPick(entries: AddEntry[], index: number): AddEntry[] {
    const next = [...entries];
    next[index] = { ...next[index], quantity: Math.max(0, next[index].quantity + 1) };
    return next;
  }

  open(): void {
    this.openSheet();
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_ADD_MODAL_OPENED);
  }

  close(): void {
    this.closeSheet();
  }

  /** Toggle "intentionally no expiry" for an entry. Clears the date. */
  setEntryNoExpiry(entryId: string): void {
    this.updateEntry(entryId, entry => {
      const toggled = !entry.noExpiry;
      return {
        ...entry,
        noExpiry: toggled || undefined,
        expirationDate: toggled ? undefined : entry.expirationDate,
      };
    });
  }

  /** Each entry becomes a brand-new product or a new lot on an existing one. */
  async submit(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }
    const entries = this.submittableEntries();
    if (!entries.length) {
      return;
    }

    await withSignalFlag(this.isSubmitting, async () => {
      const sessionId = entries.length > 1 ? createDocumentId('session') : undefined;
      for (const entry of entries) {
        const timestamp = new Date().toISOString();
        if (entry.isNew || !entry.item) {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: entry.quantity,
            expirationDate: entry.expirationDate,
            noExpiry: entry.noExpiry,
            // The row already showed the suggested type and date in editable
            // chips, so whatever it holds now is the user's decision — an empty
            // date means they cleared it on purpose.
            foodType: entry.foodType ?? undefined,
            inferExpiry: false,
          });
          const item: PantryItem = { ...base, productType: 'pantry' };
          await this.pantryStore.addItem(item);
          await this.eventManager.logAddNewItem(item, entry.quantity, sessionId, timestamp);
          this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
            kind: 'despensa',
            source: 'add_modal',
            is_new: true,
            quantity: entry.quantity,
            has_expiry: Boolean(entry.expirationDate),
          });
          continue;
        }

        const updated = await this.pantryStore.addNewLot(entry.item._id, {
          quantity: entry.quantity,
          expiryDate: entry.expirationDate,
          noExpiry: entry.noExpiry,
        });
        if (updated) {
          await this.pantryStore.updateItem(updated);
          await this.eventManager.logAddExistingItem(entry.item, updated, entry.quantity, entry.expirationDate, sessionId, timestamp);
          this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
            kind: 'despensa',
            source: 'add_modal',
            is_new: false,
            quantity: entry.quantity,
            has_expiry: Boolean(entry.expirationDate),
          });
        }
      }
      this.dismiss();
      if (entries.length === 1) {
        this.toast.success('pantry.toasts.createSuccess', { name: entries[0].name, quantity: '', breakdown: '' });
      } else {
        this.toast.success('pantry.toasts.multipleAdded', { count: entries.length });
      }
    }).catch(async err => {
      this.logger.error('PantryAddModalStateService', 'submitAdd error', err);
    });
  }
}
