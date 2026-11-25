import { inject, Injectable } from '@angular/core';
import { buildAddItemPayload, FOOD_CLASS_BY_KEY, FRESH_QTY } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import type { FoodType } from '@core/models/shared';
import { createDocumentId } from '@core/utils';
import { normalizeProductKey } from '@core/utils/normalization.util';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { ClockService } from '../shared/clock.service';
import { PantryStoreService } from './pantry-store.service';

export interface ProductDraft {
  name: string;
  classKey?: string;
  foodType?: FoodType;
  storage: 'pantry' | 'fresh';
  expirationDate?: string;
  noExpiry?: boolean;
  /** True when the user chose or cleared the date; false when it is inferred. */
  dateFromUser: boolean;
  source: 'suggestion' | 'typed';
}

/** Saves the first products of a new user (onboarding and the first-session prompt). */
@Injectable({ providedIn: 'root' })
export class FirstProductsService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly historyManager = inject(HistoryEventManagerService);
  private readonly clock = inject(ClockService);

  async save(drafts: readonly ProductDraft[]): Promise<PantryItem[]> {
    // A previous run may have been cut off before onboarding was marked seen.
    const owned = new Set(this.pantryStore.loadedProducts().map(p => normalizeProductKey(p.name)));
    drafts = drafts.filter(d => !owned.has(normalizeProductKey(d.name)));
    if (!drafts.length) {
      return [];
    }
    this.clock.tick(); // the clock only moves on foreground/midnight; this is an event timestamp
    const timestamp = new Date(this.clock.now()).toISOString();
    const sessionId = drafts.length > 1 ? createDocumentId('session') : undefined;
    const saved: PantryItem[] = [];
    for (const draft of drafts) {
      const quantity = draft.storage === 'fresh' ? FRESH_QTY.sufficient : 1;
      const base = buildAddItemPayload({
        id: createDocumentId('item'),
        nowIso: timestamp,
        name: draft.name,
        quantity,
        expirationDate: draft.expirationDate,
        noExpiry: draft.noExpiry,
        // A class gives the type; the builder must not guess it from a translated name.
        foodType: draft.foodType ?? (draft.classKey ? FOOD_CLASS_BY_KEY.get(draft.classKey)?.foodType : undefined),
        foodKind: draft.classKey,
        // A date the user chose or cleared is final; only inferred ones are filled in.
        inferExpiry: !draft.dateFromUser,
      });
      const item: PantryItem = { ...base, productType: draft.storage };
      await this.pantryStore.addItem(item);
      await this.historyManager.logAddNewItem(item, quantity, sessionId, timestamp, { dateFromUser: draft.dateFromUser });
      saved.push(item);
    }
    return saved;
  }
}
