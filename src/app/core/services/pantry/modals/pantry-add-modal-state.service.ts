import { Injectable, computed, inject, signal } from '@angular/core';
import { buildAddItemPayload } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, createDocumentId } from '@core/utils';
import { formatFriendlyName, normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { dedupeByNormalizedKey } from '@core/utils/normalization.util';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { withSignalFlag } from '@core/utils';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LanguageService } from '../../shared/language.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * Manages add modal state, entries, and submission.
 */
@Injectable()
export class PantryAddModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly toastCtrl = inject(ToastController);
  private readonly languageService = inject(LanguageService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly addModalOpen = signal(false);
  readonly isAdding = signal(false);
  readonly addQuery = signal('');
  readonly addEntries = signal<AddEntry[]>([]);

  readonly addEntryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.addEntries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      isNew: entry.isNew,
      expirationDate: entry.expirationDate,
      noExpiry: entry.noExpiry,
    }))
  );

  readonly hasAddEntries = computed(() => this.addEntries().length > 0);

  readonly addOptions = computed(() =>
    this.buildAddOptions(this.pantryStore.loadedProducts(), this.addEntries())
  );

  readonly showAddEmptyAction = computed(() => normalizeTrim(this.addQuery()).length >= 1);

  readonly addEmptyActionLabel = computed(() => {
    void this.languageService.currentLanguage();
    const name = normalizeTrim(this.addQuery());
    if (!name) {
      return '';
    }
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew')
      .replace('{{ name }}', formatted);
  });

  /**
   * Open add modal and reset state.
   */
  openAddModal(): void {
    this.addEntries.set([]);
    this.addQuery.set('');
    this.addModalOpen.set(true);
    this.isAdding.set(false);
  }

  /**
   * Close add modal and cleanup state.
   */
  closeAddModal(): void {
    if (!this.addModalOpen()) {
      return;
    }
    this.addModalOpen.set(false);
    this.isAdding.set(false);
    this.addEntries.set([]);
    this.addQuery.set('');
  }

  /**
   * Dismiss modal without cleanup (for backdrop click).
   */
  dismissAddModal(): void {
    this.addModalOpen.set(false);
  }

  /**
   * Submit all add entries (create new items or add lots).
   */
  async submitAdd(): Promise<void> {
    if (this.isAdding()) {
      return;
    }
    const entries = this.addEntries().filter(entry => entry.quantity > 0);
    if (!entries.length) {
      return;
    }

    await withSignalFlag(this.isAdding, async () => {
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
          });
          const item: PantryItem = { ...base, productType: 'pantry' };
          await this.pantryStore.addItem(item);
          await this.eventManager.logAddNewItem(item, entry.quantity, sessionId, timestamp);
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
        }
      }
      this.dismissAddModal();
      const msg = entries.length === 1
        ? this.translate.instant('pantry.toasts.createSuccess')
          .replace('{{ name }}', entries[0].name)
          .replace('{{ quantity }}', '')
          .replace('{{ breakdown }}', '')
        : this.translate.instant('pantry.toasts.multipleAdded')
          .replace('{{ count }}', String(entries.length));
      const toast = await this.toastCtrl.create({ message: msg, duration: 1500, position: 'bottom' });
      void toast.present();
    }).catch(async err => {
      console.error('[PantryAddModalStateService] submitAdd error', err);
    });
  }

  /**
   * Update search query.
   */
  onAddQueryChange(value: string): void {
    this.addQuery.set(value ?? '');
  }

  /**
   * Add existing item to add entries from autocomplete selection.
   */
  addEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.addEntries.update(current => {
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
          id: `add:${item._id}`,
          name: option.title,
          quantity: 1,
          item,
          isNew: false,
        },
      ];
    });
    this.addQuery.set('');
  }

  /**
   * Add new or existing item from query text.
   */
  addEntryFromQuery(name?: string): void {
    const nextName = normalizeTrim(name ?? this.addQuery());
    if (!nextName) {
      return;
    }
    const normalized = normalizeLowercase(nextName);
    const matchingItem = this.pantryStore
      .loadedProducts()
      .find(item => item.productType !== 'fresh' && normalizeLowercase(item.name) === normalized);

    if (matchingItem) {
      const option: AutocompleteItem<PantryItem> = {
        id: matchingItem._id,
        title: matchingItem.name,
        raw: matchingItem,
      };
      this.addEntry(option);
      return;
    }

    const formattedName = formatFriendlyName(nextName, nextName);
    this.addEntries.update(current => {
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
          id: `add:new:${normalized}`,
          name: formattedName,
          quantity: 1,
          isNew: true,
        },
      ];
    });
    this.addQuery.set('');
  }

  /**
   * Adjust quantity of an entry (remove if quantity becomes 0).
   */
  adjustEntry(entry: AddEntry, delta: number): void {
    const nextDelta = Number.isFinite(delta) ? delta : 0;
    if (!nextDelta) {
      return;
    }
    this.addEntries.update(current => {
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
  adjustEntryById(entryId: string, delta: number): void {
    const entry = this.addEntries().find(current => current.id === entryId);
    if (!entry) {
      return;
    }
    this.adjustEntry(entry, delta);
  }

  /**
   * Set or clear the expiry date for an entry by ID.
   * Clears noExpiry when a real date is set.
   */
  setEntryDate(entryId: string, date: string | undefined): void {
    this.addEntries.update(current => {
      const index = current.findIndex(row => row.id === entryId);
      if (index < 0) return current;
      const next = [...current];
      next[index] = { ...next[index], expirationDate: date || undefined, noExpiry: date ? undefined : next[index].noExpiry };
      return next;
    });
  }

  /**
   * Toggle "intentionally no expiry" for an entry. Clears expirationDate.
   */
  setEntryNoExpiry(entryId: string): void {
    this.addEntries.update(current => {
      const index = current.findIndex(row => row.id === entryId);
      if (index < 0) return current;
      const next = [...current];
      const toggled = !next[index].noExpiry;
      next[index] = { ...next[index], noExpiry: toggled || undefined, expirationDate: toggled ? undefined : next[index].expirationDate };
      return next;
    });
  }

  private buildAddOptions(items: PantryItem[], entries: AddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
    // Items legacy sin productType caen como despensa por convención.
    const nonFresh = items.filter(item => item.productType !== 'fresh');
    return buildPantryItemAutocomplete(nonFresh, {
      locale,
      excludeIds: excluded,
      getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
    });
  }
}
