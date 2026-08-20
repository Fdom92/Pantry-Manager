import { Injectable, computed, inject, signal } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { countMissingExpiryBatches, hasMissingExpiry, isIncomplete } from '@core/domain/pantry/pantry-filtering.domain';
import { inferFoodType } from '@core/domain/pantry/food-type-inference.domain';
import { applyPendienteFix, isPendienteRowResolved } from '@core/domain/pantry/pendiente-fix.domain';
import { expiryAfterFoodTypeChange } from '@core/domain/pantry/food-type-inference.domain';
import { suggestExpiryDate } from '@core/domain/pantry/expiry-suggestion.domain';
import type { PantryItem } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { withSignalFlag } from '@core/utils';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from '../../analytics/analytics.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { PantryStoreService } from '../pantry-store.service';

export interface PendienteRow {
  itemId: string;
  name: string;
  needsFoodType: boolean;
  needsDate: boolean;
  /** How many of this item's batches are missing a date — a save applies one date to all of them. */
  datelessBatchCount: number;
  foodType: FoodType | null;
  expirationDate: string | undefined;
  noExpiry: boolean;
  /** Set once the user picks a date here, so re-picking the type leaves it alone. */
  dateFromUser?: boolean;
}

/**
 * Manages the "Completar pendientes" bulk-fix sheet: builds one editable row
 * per PantryItem missing foodType and/or a batch expirationDate, then applies
 * only the rows the user actually touched on save.
 */
@Injectable()
export class PantryPendientesSheetStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly analytics = inject(AnalyticsService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly rows = signal<PendienteRow[]>([]);

  readonly hasSaveableRows = computed(() => this.rows().some(isPendienteRowResolved));

  /**
   * Open the sheet and snapshot every currently-incomplete item into a row.
   */
  open(): void {
    const items = this.pantryStore.loadedProducts().filter(isIncomplete);
    this.rows.set(items.map(item => this.buildRow(item)));
    this.isOpen.set(true);
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_PENDIENTES_SHEET_OPENED, { count: items.length });
  }

  /**
   * Close with full cleanup (used after save, or explicit close button).
   */
  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.rows.set([]);
  }

  /**
   * Dismiss only (backdrop/swipe) — no state reset, so re-opening via didDismiss is a no-op.
   */
  dismiss(): void {
    this.isOpen.set(false);
  }

  /**
   * Pick a foodType for a row. If the row also needs a date and none has been
   * set yet, pre-fill the suggested date for that foodType.
   */
  selectFoodType(itemId: string, foodType: FoodType): void {
    this.rows.update(current => current.map(row => {
      if (row.itemId !== itemId || !row.needsFoodType) {
        return row;
      }
      return {
        ...row,
        foodType,
        expirationDate: row.needsDate
          ? expiryAfterFoodTypeChange(row, foodType)
          : row.expirationDate,
      };
    }));
  }

  /**
   * Set (or clear) the pending expiry date for a row. Clears noExpiry when a real date is set.
   */
  setExpirationDate(itemId: string, date: string | undefined): void {
    this.rows.update(current => current.map(row =>
      row.itemId === itemId && row.needsDate
        ? { ...row, expirationDate: date || undefined, noExpiry: date ? false : row.noExpiry, dateFromUser: true }
        : row
    ));
  }

  /**
   * Toggle "intentionally no expiry" for a row. Clears any pending date.
   */
  toggleNoExpiry(itemId: string): void {
    this.rows.update(current => current.map(row => {
      if (row.itemId !== itemId || !row.needsDate) {
        return row;
      }
      const toggled = !row.noExpiry;
      return { ...row, noExpiry: toggled, expirationDate: toggled ? undefined : row.expirationDate };
    }));
  }

  /**
   * Persist every resolved row (has a value for everything it needed — picked
   * or pre-filled) in one pass. Rows still missing something are left as-is —
   * they remain "pendientes" and will reappear next time the sheet opens.
   */
  async saveAll(): Promise<void> {
    if (this.isSaving()) {
      return;
    }
    const saveableRows = this.rows().filter(isPendienteRowResolved);
    if (!saveableRows.length) {
      this.close();
      return;
    }

    await withSignalFlag(this.isSaving, async () => {
      const items = this.pantryStore.loadedProducts();
      let savedCount = 0;
      for (const row of saveableRows) {
        const item = items.find(candidate => candidate._id === row.itemId);
        if (!item) {
          continue;
        }

        const foodTypeFix = row.foodType && row.foodType !== item.foodType ? row.foodType : undefined;
        const dateFix = row.needsDate && (row.expirationDate || row.noExpiry)
          ? { expirationDate: row.expirationDate, noExpiry: row.noExpiry }
          : undefined;
        if (!foodTypeFix && !dateFix) {
          continue;
        }

        const updated = applyPendienteFix(item, {
          foodType: foodTypeFix,
          expirationDate: dateFix?.expirationDate,
          noExpiry: dateFix?.noExpiry,
        });
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAdvancedEdit(item, updated, 'pendientes_bulk_fix');
        savedCount++;
      }

      this.analytics.track(ANALYTICS_EVENTS.PANTRY_PENDIENTES_SAVED, { count: savedCount });
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('pantry.pendientesSheet.savedToast', { count: savedCount }),
        duration: 1500,
        position: 'bottom',
      });
      void toast.present();
      this.close();
    }).catch(err => {
      console.error('[PantryPendientesSheetStateService] saveAll error', err);
    });
  }

  private buildRow(item: PantryItem): PendienteRow {
    // For items missing a foodType, offer the inferred one as a pre-selection
    // so the user confirms rather than picks from scratch.
    const foodType = item.foodType ?? inferFoodType(item.name) ?? null;
    const needsFoodType = !item.foodType;
    const needsDate = hasMissingExpiry(item);
    return {
      itemId: item._id,
      name: item.name,
      needsFoodType,
      needsDate,
      datelessBatchCount: countMissingExpiryBatches(item),
      foodType,
      expirationDate: foodType && needsDate ? suggestExpiryDate(foodType) : undefined,
      noExpiry: false,
    };
  }
}
