import { Injectable, computed, inject, signal } from '@angular/core';
import { buildAddItemPayload } from '@core/domain/pantry';
import type { AddEntry, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, createDocumentId, withSignalFlag } from '@core/utils';
import { dedupeByNormalizedKey, formatFriendlyName, normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LanguageService } from '../../shared/language.service';
import { PantryStoreService } from '../pantry-store.service';

/**
 * Estado del modal de añadir fresco. Idéntico patrón que PantryAddModalStateService,
 * pero el catálogo se filtra a productType === 'fresh' y la submission convierte
 * cantidades en estado "Suficiente" (qty=3) por defecto.
 */
@Injectable()
export class PantryFreshAddModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly query = signal('');
  readonly entries = signal<AddEntry[]>([]);
  readonly keepInStock = signal(false);

  readonly entryViewModels = computed<EntitySelectorEntry[]>(() =>
    this.entries().map(entry => ({
      id: entry.id,
      title: entry.name,
      quantity: entry.quantity,
      isNew: entry.isNew,
      expirationDate: entry.expirationDate,
      noExpiry: entry.noExpiry,
    }))
  );

  readonly hasEntries = computed(() => this.entries().length > 0);

  readonly options = computed(() => this.buildOptions(this.pantryStore.loadedProducts(), this.entries()));

  readonly showEmptyAction = computed(() => normalizeTrim(this.query()).length >= 1);

  readonly emptyActionLabel = computed(() => {
    const name = normalizeTrim(this.query());
    if (!name) return '';
    const formatted = formatFriendlyName(name, name);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });

  open(): void {
    this.entries.set([]);
    this.query.set('');
    this.keepInStock.set(false);
    this.isOpen.set(true);
    this.isSubmitting.set(false);
  }

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.isSubmitting.set(false);
    this.entries.set([]);
    this.query.set('');
    this.keepInStock.set(false);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  onQueryChange(value: string): void {
    this.query.set(value ?? '');
  }

  toggleKeepInStock(): void {
    this.keepInStock.update(v => !v);
  }

  /** Selección de un item existente desde el autocomplete. */
  addEntry(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) return;
    this.entries.update(current => {
      const idx = current.findIndex(e => e.item?._id === item._id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = { ...next[idx], quantity: Math.max(0, next[idx].quantity + 1) };
        return next;
      }
      return [
        ...current,
        { id: `fresh:${item._id}`, name: option.title, quantity: 1, item, isNew: false },
      ];
    });
    this.query.set('');
  }

  addEntryFromQuery(name?: string): void {
    const next = normalizeTrim(name ?? this.query());
    if (!next) return;
    const normalized = normalizeLowercase(next);
    // Solo busca contra el catálogo de frescos (no merges con un item de despensa con el mismo nombre).
    const match = this.pantryStore
      .loadedProducts()
      .find(i => i.productType === 'fresh' && normalizeLowercase(i.name) === normalized);

    if (match) {
      this.addEntry({ id: match._id, title: match.name, raw: match });
      return;
    }

    const formatted = formatFriendlyName(next, next);
    this.entries.update(current => {
      const idx = current.findIndex(e => normalizeLowercase(e.name) === normalized);
      if (idx >= 0) {
        const nextArr = [...current];
        nextArr[idx] = { ...nextArr[idx], quantity: Math.max(0, nextArr[idx].quantity + 1) };
        return nextArr;
      }
      return [
        ...current,
        { id: `fresh:new:${normalized}`, name: formatted, quantity: 1, isNew: true },
      ];
    });
    this.query.set('');
  }

  adjustEntryById(entryId: string, delta: number): void {
    const d = Number.isFinite(delta) ? delta : 0;
    if (!d) return;
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      const updated = { ...next[idx], quantity: Math.max(0, next[idx].quantity + d) };
      if (updated.quantity <= 0) {
        next.splice(idx, 1);
        return next;
      }
      next[idx] = updated;
      return next;
    });
  }

  setEntryDate(entryId: string, date: string | undefined): void {
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      next[idx] = { ...next[idx], expirationDate: date || undefined, noExpiry: date ? undefined : next[idx].noExpiry };
      return next;
    });
  }

  setEntryNoExpiry(entryId: string): void {
    this.entries.update(current => {
      const idx = current.findIndex(e => e.id === entryId);
      if (idx < 0) return current;
      const next = [...current];
      const toggled = !next[idx].noExpiry;
      next[idx] = { ...next[idx], noExpiry: toggled || undefined, expirationDate: toggled ? undefined : next[idx].expirationDate };
      return next;
    });
  }

  /**
   * Submission. Cada entry se materializa así:
   * - isNew → crea PantryItem con productType='fresh', batch único qty=3 (Suficiente),
   *           expirationDate del entry, minThreshold=1 si keepInStock global está activo.
   * - existing → sobrescribe el batch único del fresco (qty=3, fecha si proporcionada).
   *              Esto preserva la convención "fresco = 1 lote" en lugar de añadir nuevos lotes.
   */
  async submit(): Promise<void> {
    if (this.isSubmitting()) return;
    const entries = this.entries().filter(e => e.quantity > 0);
    if (!entries.length) return;

    await withSignalFlag(this.isSubmitting, async () => {
      const sessionId = entries.length > 1 ? createDocumentId('session') : undefined;
      const minThreshold = this.keepInStock() ? 1 : undefined;

      for (const entry of entries) {
        const timestamp = new Date().toISOString();

        if (entry.isNew || !entry.item) {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: entry.name,
            quantity: 3, // Suficiente
            expirationDate: entry.expirationDate,
            noExpiry: entry.noExpiry,
          });
          const freshItem: PantryItem = {
            ...base,
            productType: 'fresh',
            minThreshold,
            isBasic: false,
          };
          await this.pantryStore.addItem(freshItem);
          await this.eventManager.logAddNewItem(freshItem, 3, sessionId, timestamp);
          continue;
        }

        // Existente: sobrescribe el batch único.
        const existing = entry.item;
        const previousBatch = existing.batches?.[0];
        const updatedBatch = {
          batchId: previousBatch?.batchId ?? `batch-${Date.now()}`,
          quantity: 3,
          expirationDate: entry.expirationDate ?? previousBatch?.expirationDate,
          noExpiry: entry.noExpiry ?? previousBatch?.noExpiry,
          opened: previousBatch?.opened,
          locationId: previousBatch?.locationId,
        };
        const updated: PantryItem = {
          ...existing,
          batches: [updatedBatch],
          minThreshold: minThreshold ?? existing.minThreshold,
          updatedAt: timestamp,
        };
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAddExistingItem(existing, updated, 3, entry.expirationDate, sessionId, timestamp);
      }
      this.dismiss();
    }).catch(err => console.error('[PantryFreshAddModalStateService] submit error', err));
  }

  private buildOptions(items: PantryItem[], entries: AddEntry[]): AutocompleteItem<PantryItem>[] {
    const locale = this.languageService.getCurrentLocale();
    const uniqueEntries = dedupeByNormalizedKey(entries, e => e.name);
    const excluded = new Set(uniqueEntries.map(e => e.item?._id).filter(Boolean) as string[]);
    // Filtramos a SOLO frescos antes de pasar al autocomplete.
    const onlyFresh = items.filter(i => i.productType === 'fresh');
    return buildPantryItemAutocomplete(onlyFresh, {
      locale,
      excludeIds: excluded,
      getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
    });
  }
}
