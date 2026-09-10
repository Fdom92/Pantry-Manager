import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { ITEM_DELETE_ANIMATION_DURATION_MS } from '@core/constants';
import type { PantryGroup, PantryItem } from '@core/models/pantry';
import { sleep } from '@core/utils';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService, ToastService } from '../shared';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { LoggerService } from '../shared/logger.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { PantryStoreService } from './pantry-store.service';

/**
 * Manages pantry list UI state: group collapse, deletion animations, keyboard handlers.
 */
@Injectable()
export class PantryListUiStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);
  private readonly confirm = inject(ConfirmService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly logger = inject(LoggerService);

  readonly collapsedGroups: WritableSignal<Set<string>> = signal(new Set());
  readonly deletingItems: WritableSignal<Set<string>> = signal(new Set());
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);

  private readonly deleteAnimationDuration = ITEM_DELETE_ANIMATION_DURATION_MS;

  /**
   * TrackBy function for ngFor on items.
   */
  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  /**
   * Check if group is collapsed.
   */
  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }

  /**
   * Toggle group collapse state.
   */
  toggleGroupCollapse(key: string, event?: Event): void {
    event?.stopPropagation();
    this.collapsedGroups.update(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  /**
   * Handle keyboard navigation on group header (Enter/Space to toggle collapse).
   */
  onGroupHeaderKeydown(key: string, event: KeyboardEvent): void {
    const keyName = event.key.toLowerCase();
    if (keyName === 'enter' || keyName === ' ') {
      event.preventDefault();
      this.toggleGroupCollapse(key);
    }
  }

  /**
   * Check if item is being deleted (for animation).
   */
  isDeleting(item: PantryItem): boolean {
    return this.deletingItems().has(item._id);
  }

  /**
   * Delete item with confirmation and animation.
   */
  async deleteItem(
    item: PantryItem,
    event?: Event,
    skipConfirm = false,
    cancelPendingStockSave?: (itemId: string) => void,
    consumeAll?: (item: PantryItem) => Promise<void>
  ): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }

    const remaining = (item.batches ?? []).reduce((sum, batch) => sum + (batch.quantity ?? 0), 0);
    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';

    if (shouldConfirm) {
      // A product with stock left is almost never a mistake to erase — it is
      // someone saying "I finished this" with the only button the app gave
      // them. 23 deletions against 19 quantity adjustments over 30 days, and
      // every one of those deletions threw away the consumption history the
      // waste tracker and the insights are starved of. So ask which they mean.
      if (remaining > 0 && consumeAll) {
        const choice = await this.confirm.choose(
          this.translate.instant('pantry.deleteWithStock.message', {
            name: item.name ?? '',
            count: remaining,
          }),
          {
            header: this.translate.instant('pantry.deleteWithStock.header'),
            choices: [
              { role: 'consumed', labelKey: 'pantry.deleteWithStock.consumed' },
              { role: 'delete', labelKey: 'pantry.deleteWithStock.delete', danger: true },
            ] as const,
          },
        );
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_DELETE_INTENT_RESOLVED, {
          choice,
          quantity: remaining,
          kind: item.productType === 'fresh' ? 'fresh' : 'despensa',
        });
        if (choice === 'cancel') {
          return;
        }
        if (choice === 'consumed') {
          cancelPendingStockSave?.(item._id);
          await consumeAll(item);
          this.toast.success('pantry.toasts.markedConsumed');
          return;
        }
        // 'delete' falls through to the normal removal path below.
      } else {
        const msg = this.translate.instant('pantry.confirmDelete', { name: item.name ?? '' });
        const confirmed = await this.confirm.confirm(msg, { confirmKey: 'common.actions.delete' });
        if (!confirmed) {
          return;
        }
      }
    }

    // Cancel any pending stock save for this item
    if (cancelPendingStockSave) {
      cancelPendingStockSave(item._id);
    }

    this.markItemDeleting(item._id);
    try {
      await sleep(this.deleteAnimationDuration);
      await this.pantryStore.deleteItem(item._id);
      await this.eventManager.logDeleteFromCard(item);
      this.toast.success('pantry.toasts.deleted');
    } catch (err) {
      this.logger.error('PantryListUiStateService', 'deleteItem error', err);
    } finally {
      this.unmarkItemDeleting(item._id);
    }
  }

  /**
   * Sync collapsed groups with current groups (cleanup invalid keys).
   */
  syncCollapsedGroups(groups: PantryGroup[]): void {
    const validKeys = new Set(groups.map(group => group.key));
    this.collapsedGroups.update(current => {
      const next = new Set(current);
      for (const key of Array.from(next)) {
        if (!validKeys.has(key)) {
          next.delete(key);
        }
      }
      return next;
    });
  }

  private markItemDeleting(id: string): void {
    this.deletingItems.update(current => {
      if (current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  private unmarkItemDeleting(id: string): void {
    this.deletingItems.update(current => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
}
