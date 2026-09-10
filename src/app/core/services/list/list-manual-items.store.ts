import { Injectable, signal } from '@angular/core';
import { inject } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import type { BoughtItem, ManualItem } from '@core/models/list';
import { formatFriendlyName } from '@core/utils/normalization.util';
import { AnalyticsService } from '../analytics/analytics.service';
import { LocalStorageService } from '../shared/local-storage.service';

@Injectable({ providedIn: 'root' })
export class ListManualItemsStore {
  private readonly analytics = inject(AnalyticsService);
  private readonly storage = inject(LocalStorageService);

  // No expiry. Until 5.4 anything older than 7 days was pruned here on every
  // launch, without a word: write "bombillas", shop eight days later, and it
  // was simply gone. A shopping list is the user's own note — it stays until
  // they buy it or remove it themselves. createdAt is still written; it just
  // no longer decides anything.
  readonly manualItems = signal<ManualItem[]>(this.storage.manualList.getItems<ManualItem>());
  readonly boughtManuals = signal<BoughtItem[]>([]);

  addManualItem(name: string, source: 'user' | 'preset' = 'user'): void {
    const id = crypto.randomUUID();
    // Title-case the name at the source so the shopping list, bought-manuals
    // and pantry entries created on "buy" all share the same casing as
    // products added through the regular add flow.
    const friendly = formatFriendlyName(name, name);
    const updated = [...this.manualItems(), { id, name: friendly, createdAt: Date.now() }];
    this.manualItems.set(updated);
    this.storage.manualList.setItems(updated);
    // 'preset' adds are already analytics-attributed by the originating
    // surface (e.g. repo_prediction_added_to_list), so avoid the duplicate
    // shopping_manual_added event that would muddy the manual-add funnel.
    if (source === 'user') {
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_MANUAL_ADDED);
    }
  }

  removeManual(id: string): ManualItem | undefined {
    const item = this.manualItems().find(m => m.id === id);
    const updated = this.manualItems().filter(m => m.id !== id);
    this.manualItems.set(updated);
    this.storage.manualList.setItems(updated);
    return item;
  }

  markManualAsBought(id: string): ManualItem | undefined {
    const item = this.manualItems().find(m => m.id === id);
    if (!item) return undefined;
    const updated = this.manualItems().filter(m => m.id !== id);
    this.manualItems.set(updated);
    this.storage.manualList.setItems(updated);
    this.boughtManuals.update(list => [...list, { id, name: item.name }]);
    return item;
  }

  restoreBoughtManual(id: string): void {
    this.boughtManuals.update(list => list.filter(b => b.id !== id));
  }

  clear(): void {
    this.manualItems.set([]);
    this.boughtManuals.set([]);
    this.storage.manualList.clear();
  }

  /** Clear only the "Comprado" history for manual items. Pending items stay. */
  clearBoughtManuals(): void {
    this.boughtManuals.set([]);
  }
}
