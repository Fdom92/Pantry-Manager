import { Injectable, computed, inject, signal } from '@angular/core';
import { buildFastAddItemPayload } from '@core/domain/pantry';
import type { FastAddEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, createDocumentId } from '@core/utils';
import { formatFriendlyName, normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { dedupeByNormalizedKey } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { withSignalFlag } from '@core/utils';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LanguageService } from '../../shared/language.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * Manages fast-add modal state, entries, and submission.
 */
@Injectable()
export class PantryFastAddModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly fastAddModalOpen = signal(false);
  readonly isFastAdding = signal(false);
  readonly fastAddQuery = signal('');
  readonly fastAddEntries = signal<FastAddEntry[]>([]);

  readonly fastAddEntryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.fastAddEntries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      isNew: entry.isNew,
    }))
  );

  readonly hasFastAddEntries = computed(() => this.fastAddEntries().length > 0);

  readonly fastAddOptions = computed(() =>
    this.buildFastAddOptions(this.pantryStore.loadedProducts(), this.fastAddEntries())
  );

  readonly showFastAddEmptyAction = computed(() => normalizeTrim(this.fastAddQuery()).length >= 1);

  readonly fastAddEmptyActionLabel = computed(() => {
    const name = normalizeTrim(this.fastAddQuery());
    if (!name) {
      return '';
    }
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });

  /**
   * Open fast-add modal and reset state.
   */
  openFastAddModal(): void {
    this.fastAddEntries.set([]);
    this.fastAddQuery.set('');
    this.fastAddModalOpen.set(true);
    this.isFastAdding.set(false);
  }

  /**
   * Close fast-add modal and cleanup state.
   */
  closeFastAddModal(): void {
    if (!this.fastAddModalOpen()) {
      return;
    }
    this.fastAddModalOpen.set(false);
    this.isFastAdding.set(false);
    this.fastAddEntries.set([]);
    this.fastAddQuery.set('');
  }

  /**
   * Dismiss modal without cleanup (for backdrop click).
   */
  dismissFastAddModal(): void {
    this.fastAddModalOpen.set(false);
  }

  /**
   * Submit all fast-add entries (create new items or add lots).
   */
  async submitFastAdd(): Promise<void> {
    if (this.isFastAdding()) {
      return;
    }
    const entries = this.fastAddEntries().filter(entry => entry.quantity > 0);
    if (!entries.length) {
      return;
    }

    await withSignalFlag(this.isFastAdding, async () => {
      for (const entry of entries) {
        const timestamp = new Date().toISOString();
        if (entry.isNew || !entry.item) {
          const item = buildFastAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: entry.quantity,
          });
          await this.pantryStore.addItem(item);
          await this.eventManager.logFastAddNewItem(item, entry.quantity, timestamp);
          continue;
        }

        const updated = await this.pantryStore.addNewLot(entry.item._id, {
          quantity: entry.quantity,
        });
        if (updated) {
          await this.pantryStore.updateItem(updated);
          await this.eventManager.logFastAddExistingItem(entry.item, updated, entry.quantity, timestamp);
        }
      }
      this.dismissFastAddModal();
    }).catch(async err => {
      console.error('[PantryFastAddModalStateService] submitFastAdd error', err);
    });
  }

  /**
   * Update search query.
   */
  onFastAddQueryChange(value: string): void {
    this.fastAddQuery.set(value ?? '');
  }

  /**
   * Add existing item to fast-add entries from autocomplete selection.
   */
  addFastAddEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.fastAddEntries.update(current => {
      const existingIndex = current.findIndex(entry => entry.item?._id === item._id);
      if (existingIndex >= 0) {
        const next = [...current];
        const updated = { ...next[existingIndex] };
        updated.quantity = Math.max(0, updated.quantity + 1);
        next[existingIndex] = updated;
        return next;
      }
      return [
        ...current,
        {
          id: `fast-add:${item._id}`,
          name: option.title,
          quantity: 1,
          item,
          isNew: false,
        },
      ];
    });
    this.fastAddQuery.set('');
  }

  /**
   * Add new or existing item from query text.
   */
  addFastAddEntryFromQuery(name?: string): void {
    const nextName = normalizeTrim(name ?? this.fastAddQuery());
    if (!nextName) {
      return;
    }
    const normalized = normalizeLowercase(nextName);
    const matchingItem = this.pantryStore
      .loadedProducts()
      .find(item => normalizeLowercase(item.name) === normalized);

    if (matchingItem) {
      const option: AutocompleteItem<PantryItem> = {
        id: matchingItem._id,
        title: matchingItem.name,
        raw: matchingItem,
      };
      this.addFastAddEntry(option);
      return;
    }

    const formattedName = formatFriendlyName(nextName, nextName);
    this.fastAddEntries.update(current => {
      const existingIndex = current.findIndex(entry => normalizeLowercase(entry.name) === normalized);
      if (existingIndex >= 0) {
        const next = [...current];
        const updated = { ...next[existingIndex] };
        updated.quantity = Math.max(0, updated.quantity + 1);
        next[existingIndex] = updated;
        return next;
      }
      return [
        ...current,
        {
          id: `fast-add:new:${normalized}`,
          name: formattedName,
          quantity: 1,
          isNew: true,
        },
      ];
    });
    this.fastAddQuery.set('');
  }

  /**
   * Adjust quantity of an entry (remove if quantity becomes 0).
   */
  adjustFastAddEntry(entry: FastAddEntry, delta: number): void {
    const nextDelta = Number.isFinite(delta) ? delta : 0;
    if (!nextDelta) {
      return;
    }
    this.fastAddEntries.update(current => {
      const index = current.findIndex(row => row.id === entry.id);
      if (index < 0) {
        return current;
      }
      const next = [...current];
      const updated = { ...next[index] };
      updated.quantity = Math.max(0, updated.quantity + nextDelta);
      if (updated.quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = updated;
      return next;
    });
  }

  /**
   * Adjust quantity by entry ID.
   */
  adjustFastAddEntryById(entryId: string, delta: number): void {
    const entry = this.fastAddEntries().find(current => current.id === entryId);
    if (!entry) {
      return;
    }
    this.adjustFastAddEntry(entry, delta);
  }

  private buildFastAddOptions(items: PantryItem[], entries: FastAddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
    return buildPantryItemAutocomplete(items, {
      locale,
      excludeIds: excluded,
      getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
    });
  }
}
