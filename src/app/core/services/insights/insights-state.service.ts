import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryEvent } from '@core/models/events';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
} from '@core/domain/insights/insights-free.domain';
import type { ActivityMetrics, DistributionMetrics, InventorySnapshot } from '@core/domain/insights/insights-free.domain';

export type { ActivityMetrics, DistributionMetrics, InventorySnapshot };

@Injectable()
export class InsightsStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly revenueCat = inject(UpgradeRevenuecatService);

  private readonly events = signal<PantryEvent[]>([]);
  readonly isLoadingEvents = signal(true);

  readonly inventorySnapshot = computed((): InventorySnapshot =>
    computeInventorySnapshot(this.pantryStore.items(), new Date())
  );

  readonly activityMetrics = computed((): ActivityMetrics =>
    computeActivityMetrics(this.events(), 30, new Date())
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(), 30)
  );

  readonly isPro = computed(() => this.revenueCat.isPro());

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.isLoadingEvents.set(true);
    const loaded = await this.eventLog.listEvents();
    this.events.set(loaded);
    this.isLoadingEvents.set(false);
  }
}
