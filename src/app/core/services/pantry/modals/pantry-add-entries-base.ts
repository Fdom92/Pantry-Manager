import { computed, inject, signal } from '@angular/core';
import { resolveSuggestedExpiry, sumQuantities } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete } from '@core/utils';
import { dedupeByNormalizedKey, formatFriendlyName, normalizeProductKey, normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { LanguageService } from '../../shared/language.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * The list a user builds before saving in either add sheet: pick from the
 * catalogue, type a name, nudge quantities, set dates. Despensa and fresco run
 * the same engine and disagree in three places, which are the abstract members
 * below — everything else is written once here.
 *
 * Submission is deliberately not part of this: a despensa entry becomes a new
 * lot, a fresco entry overwrites the product's single batch. Those are
 * different operations, not one operation with a flag.
 */
export abstract class PantryAddEntriesBase {
  protected readonly pantryStore = inject(PantryStoreService);
  protected readonly translate = inject(TranslateService);
  protected readonly languageService = inject(LanguageService);

  /** Prefix for generated entry ids, so the two sheets never collide. */
  protected abstract readonly idPrefix: string;

  /** Which half of the catalogue this sheet draws from. */
  protected abstract belongsToCatalogue(item: PantryItem): boolean;

  /**
   * What happens when the user picks something already in the list. Despensa
   * counts a second tin; a fresh product is either had or not had.
   */
  protected abstract onRepeatedPick(entries: AddEntry[], index: number): AddEntry[];

  /** Per-sheet fields on a new entry — despensa carries a food type, fresco does not. */
  protected abstract decorateEntry(name: string, item?: PantryItem): Partial<AddEntry>;

  readonly isOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly query = signal('');
  readonly entries = signal<AddEntry[]>([]);

  readonly hasEntries = computed(() => this.entries().length > 0);

  readonly entryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.entries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      isNew: entry.isNew,
      expirationDate: entry.expirationDate,
      noExpiry: entry.noExpiry,
      foodType: entry.foodType,
    }))
  );

  readonly options = computed(() => this.buildOptions(this.pantryStore.loadedProducts(), this.entries()));

  readonly showEmptyAction = computed(() => normalizeTrim(this.query()).length >= 1);

  readonly emptyActionLabel = computed(() => {
    void this.languageService.currentLanguage();
    const name = normalizeTrim(this.query());
    if (!name) {
      return '';
    }
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });

  /** Open with a clean draft. */
  protected openSheet(): void {
    this.entries.set([]);
    this.query.set('');
    this.isOpen.set(true);
    this.isSubmitting.set(false);
  }

  /** Close and wipe the draft. */
  protected closeSheet(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.isSubmitting.set(false);
    this.entries.set([]);
    this.query.set('');
  }

  /** Hide without wiping — the sheet is being dismissed, not abandoned. */
  dismiss(): void {
    this.isOpen.set(false);
  }

  onQueryChange(value: string): void {
    this.query.set(value ?? '');
  }

  /** A pick from the autocomplete. */
  addEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.entries.update(current => {
      const index = current.findIndex(entry => entry.item?._id === item._id);
      if (index >= 0) {
        return this.onRepeatedPick(current, index);
      }
      return [
        ...current,
        {
          id: `${this.idPrefix}:${item._id}`,
          name: option.title,
          quantity: 1,
          item,
          isNew: false,
          ...this.decorateEntry(option.title, item),
        },
      ];
    });
    this.query.set('');
  }

  /** Free text: reuse a catalogue product of that name, or start a new one. */
  addEntryFromQuery(name?: string): void {
    const next = normalizeTrim(name ?? this.query());
    if (!next) {
      return;
    }
    const normalized = normalizeProductKey(next);
    const match = this.pantryStore
      .loadedProducts()
      .find(item => this.belongsToCatalogue(item) && normalizeProductKey(item.name) === normalized);

    if (match) {
      this.addEntry({ id: match._id, title: match.name, raw: match });
      return;
    }

    const formatted = formatFriendlyName(next, next);
    this.entries.update(current => {
      const index = current.findIndex(entry => normalizeProductKey(entry.name) === normalized);
      if (index >= 0) {
        return this.onRepeatedPick(current, index);
      }
      return [
        ...current,
        {
          id: `${this.idPrefix}:new:${normalized}`,
          name: formatted,
          quantity: 1,
          isNew: true,
          ...this.decorateEntry(formatted),
        },
      ];
    });
    this.query.set('');
  }

  /**
   * Set or clear the expiry date for an entry. A cleared date is a decision
   * too, which is why both paths mark it as the user's.
   */
  setEntryDate(entryId: string, date: string | undefined): void {
    this.updateEntry(entryId, entry => ({
      ...entry,
      expirationDate: date || undefined,
      noExpiry: date ? undefined : entry.noExpiry,
      dateFromUser: true,
    }));
  }

  /** Nudge the quantity; the row disappears when it reaches zero. */
  adjustEntryById(entryId: string, delta: number): void {
    const step = Number.isFinite(delta) ? delta : 0;
    if (!step) {
      return;
    }
    this.entries.update(current => {
      const index = current.findIndex(entry => entry.id === entryId);
      if (index < 0) {
        return current;
      }
      const next = [...current];
      const updated = { ...next[index], quantity: Math.max(0, next[index].quantity + step) };
      if (updated.quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = updated;
      return next;
    });
  }

  protected updateEntry(entryId: string, updater: (entry: AddEntry) => AddEntry): void {
    this.entries.update(current => {
      const index = current.findIndex(entry => entry.id === entryId);
      if (index < 0) {
        return current;
      }
      const next = [...current];
      next[index] = updater(next[index]);
      return next;
    });
  }

  /** Entries worth saving, in the order the user built them. */
  protected submittableEntries(): AddEntry[] {
    return this.entries().filter(entry => entry.quantity > 0);
  }

  /** A restock is a new carton, so it gets a fresh suggestion, not the old batch's date. */
  protected suggestedExpiryFor(name: string, item?: PantryItem): Partial<AddEntry> {
    return resolveSuggestedExpiry(name, item?.foodType ?? null);
  }

  private buildOptions(items: PantryItem[], entries: AddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, entry => entry.name);
    const excluded = new Set(uniqueEntries.map(entry => entry.item?._id).filter(Boolean) as string[]);
    return buildPantryItemAutocomplete(items.filter(item => this.belongsToCatalogue(item)), {
      locale,
      excludeIds: excluded,
      getQuantity: item => sumQuantities(item.batches ?? []),
    });
  }
}
