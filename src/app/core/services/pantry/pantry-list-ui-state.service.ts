import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { ITEM_DELETE_ANIMATION_DURATION_MS } from '@core/constants';
import type { PantryGroup, PantryItem } from '@core/models/pantry';
import { sleep } from '@core/utils';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService } from '../shared';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { PantryStoreService } from './pantry-store.service';

/**
 * Manages pantry list UI state: expansion/collapse, deletion animations, keyboard handlers.
 */
@Injectable()
export class PantryListUiStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(ConfirmService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly collapsedGroups: WritableSignal<Set<string>> = signal(new Set());
  readonly deletingItems: WritableSignal<Set<string>> = signal(new Set());
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);

  private readonly expandedItems = new Set<string>();
  private readonly deleteAnimationDuration = ITEM_DELETE_ANIMATION_DURATION_MS;

  /**
   * TrackBy function for ngFor on items.
   */
  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  /**
   * Handle keyboard navigation on item summary (Enter/Space to toggle expansion).
   */
  onSummaryKeydown(item: PantryItem, event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      this.toggleItemExpansion(item);
    }
  }

  /**
   * Check if item is expanded.
   */
  isExpanded(item: PantryItem): boolean {
    return this.expandedItems.has(item._id);
  }

  /**
   * Toggle item expansion state.
   */
  toggleItemExpansion(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedItems.has(item._id)) {
      this.expandedItems.delete(item._id);
    } else {
      this.expandedItems.add(item._id);
    }
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
    cancelPendingStockSave?: (itemId: string) => void
  ): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }

    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';
    if (shouldConfirm) {
      const confirmed = this.confirm.confirm(this.translate.instant('pantry.confirmDelete', { name: item.name ?? '' }));
      if (!confirmed) {
        return;
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
      this.expandedItems.delete(item._id);
    } catch (err) {
      console.error('[PantryListUiStateService] deleteItem error', err);
    } finally {
      this.unmarkItemDeleting(item._id);
    }
  }

  /**
   * Sync expanded items with current page items (cleanup invalid IDs).
   */
  syncExpandedItems(source: PantryItem[]): void {
    const validIds = new Set(source.map(item => item._id));
    for (const id of Array.from(this.expandedItems)) {
      if (!validIds.has(id)) {
        this.expandedItems.delete(id);
      }
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
