import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import type { ConsumeEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, createDocumentId } from '@core/utils';
import { dedupeByNormalizedKey } from '@core/utils/normalization.util';
import { withSignalFlag } from '@core/utils';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../../analytics/analytics.service';
import { LanguageService } from '../../shared/language.service';
import { ReviewPromptService } from '../../shared/review-prompt.service';
import { PantryBatchOperationsService } from '../pantry-batch-operations.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * Manages consume modal state, entries, and batch FIFO submission.
 */
@Injectable()
export class PantryConsumeModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly languageService = inject(LanguageService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly analytics = inject(AnalyticsService);

  // Reference to pantry items state for optimistic updates
  pantryItemsState?: WritableSignal<PantryItem[]>;

  readonly consumeModalOpen = signal(false);
  readonly isConsuming = signal(false);
  readonly consumeQuery = signal('');
  readonly consumeEntries = signal<ConsumeEntry[]>([]);

  readonly consumeEntryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.consumeEntries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      maxQuantity: entry.maxQuantity,
    }))
  );

  readonly hasConsumeEntries = computed(() => this.consumeEntries().length > 0);

  readonly consumeOptions = computed(() =>
    this.buildConsumeOptions(this.pantryStore.loadedProducts(), this.consumeEntries())
  );

  /**
   * Open consume modal and reset state.
   */
  openConsumeModal(): void {
    this.consumeEntries.set([]);
    this.consumeQuery.set('');
    this.consumeModalOpen.set(true);
    this.isConsuming.set(false);
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_CONSUME_MODAL_OPENED);
  }

  /**
   * Close consume modal and cleanup state.
   */
  closeConsumeModal(): void {
    if (!this.consumeModalOpen()) {
      return;
    }
    this.consumeModalOpen.set(false);
    this.isConsuming.set(false);
    this.consumeEntries.set([]);
    this.consumeQuery.set('');
  }

  /**
   * Dismiss modal without cleanup (for backdrop click).
   */
  dismissConsumeModal(): void {
    this.consumeModalOpen.set(false);
  }

  /**
   * Submit all consume entries applying FIFO per item.
   */
  async submitConsume(): Promise<void> {
    if (this.isConsuming()) {
      return;
    }
    const entries = this.consumeEntries().filter(entry => entry.quantity > 0);
    if (!entries.length) {
      return;
    }

    await withSignalFlag(this.isConsuming, async () => {
      const sessionId = entries.length > 1 ? createDocumentId('session') : undefined;
      for (const entry of entries) {
        // Re-fetch the latest item state for accurate FIFO application
        const latestItem =
          this.pantryItemsState?.()?.find(i => i._id === entry.item._id) ?? entry.item;
        await this.batchOps.adjustTotalQuantityWithFIFO(
          latestItem,
          -entry.quantity,
          this.pantryItemsState,
          latestItem.expirationDate ?? undefined,
          'consume_modal',
          undefined,
          sessionId
        );
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_CONSUMED, {
          kind: latestItem.productType === 'fresh' ? 'fresh' : 'despensa',
          source: 'consume_modal',
          quantity: entry.quantity,
        });
      }
      this.dismissConsumeModal();
      this.reviewPrompt.handleConsumeCompleted();
    }).catch(err => {
      console.error('[PantryConsumeModalStateService] submitConsume error', err);
    });
  }

  /**
   * Update search query.
   */
  onConsumeQueryChange(value: string): void {
    this.consumeQuery.set(value ?? '');
  }

  /**
   * Add existing item to consume entries from autocomplete selection.
   */
  addConsumeEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    const maxQuantity = this.batchOps.getTotalQuantity(item);
    if (maxQuantity <= 0) {
      return;
    }
    this.consumeEntries.update(current => {
      const existingIndex = current.findIndex(entry => entry.item._id === item._id);
      if (existingIndex >= 0) {
        const next = [...current];
        const updated = { ...next[existingIndex] };
        updated.quantity = Math.min(updated.maxQuantity, updated.quantity + 1);
        next[existingIndex] = updated;
        return next;
      }
      return [
        ...current,
        {
          id: `consume:${item._id}`,
          name: option.title,
          quantity: 1,
          maxQuantity,
          item,
        },
      ];
    });
    this.consumeQuery.set('');
  }

  /**
   * Adjust quantity of an entry by entry ID (remove if quantity reaches 0).
   */
  adjustConsumeEntryById(entryId: string, delta: number): void {
    const nextDelta = Number.isFinite(delta) ? delta : 0;
    if (!nextDelta) {
      return;
    }
    this.consumeEntries.update(current => {
      const index = current.findIndex(row => row.id === entryId);
      if (index < 0) {
        return current;
      }
      const next = [...current];
      const updated = { ...next[index] };
      updated.quantity = Math.min(
        updated.maxQuantity,
        Math.max(0, updated.quantity + nextDelta)
      );
      if (updated.quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = updated;
      return next;
    });
  }

  private buildConsumeOptions(
    items: PantryItem[],
    entries: ConsumeEntry[]
  ): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item._id));
    return buildPantryItemAutocomplete(
      items.filter(item => this.batchOps.getTotalQuantity(item) > 0),
      {
        locale,
        excludeIds: excluded,
        getQuantity: item => this.batchOps.getTotalQuantity(item),
      }
    );
  }
}
