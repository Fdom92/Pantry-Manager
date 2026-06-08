import { Injectable, signal } from '@angular/core';
import { inject } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import type { BoughtItem, ManualItem } from '@core/models/list';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable({ providedIn: 'root' })
export class ListManualItemsStore {
  private readonly analytics = inject(AnalyticsService);

  readonly manualItems = signal<ManualItem[]>([]);
  readonly boughtManuals = signal<BoughtItem[]>([]);

  addManualItem(name: string, source: 'user' | 'preset' = 'user'): void {
    const id = crypto.randomUUID();
    this.manualItems.update(list => [...list, { id, name }]);
    // 'preset' adds are already analytics-attributed by the originating
    // surface (e.g. repo_prediction_added_to_list), so avoid the duplicate
    // shopping_manual_added event that would muddy the manual-add funnel.
    if (source === 'user') {
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_MANUAL_ADDED);
    }
  }

  removeManual(id: string): ManualItem | undefined {
    const item = this.manualItems().find(m => m.id === id);
    this.manualItems.update(list => list.filter(m => m.id !== id));
    return item;
  }

  markManualAsBought(id: string): ManualItem | undefined {
    const item = this.manualItems().find(m => m.id === id);
    if (!item) return undefined;
    this.manualItems.update(list => list.filter(m => m.id !== id));
    this.boughtManuals.update(list => [...list, { id, name: item.name }]);
    return item;
  }

  restoreBoughtManual(id: string): void {
    this.boughtManuals.update(list => list.filter(b => b.id !== id));
  }

  clear(): void {
    this.manualItems.set([]);
    this.boughtManuals.set([]);
  }
}
