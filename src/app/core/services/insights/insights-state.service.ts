import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryEvent } from '@core/models/events';
import type { InsightsAnalysis, InsightsAnalysisPayload } from '@core/models/insights/insights-analysis.model';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { InsightsCacheStorageService } from './insights-cache-storage.service';
import { InsightsLlmClientService } from './insights-llm-client.service';
import type { InsightsClientError } from './insights-llm-client.service';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
} from '@core/domain/insights/insights-free.domain';
import type { ActivityMetrics, DistributionMetrics, InventorySnapshot } from '@core/domain/insights/insights-free.domain';

export type { ActivityMetrics, DistributionMetrics, InventorySnapshot };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class InsightsStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly revenueCat = inject(UpgradeRevenuecatService);
  private readonly cacheStorage = inject(InsightsCacheStorageService);
  private readonly llmClient = inject(InsightsLlmClientService);

  private readonly events = signal<PantryEvent[]>([]);
  readonly isLoadingEvents = signal(true);

  readonly proAnalysis = signal<InsightsAnalysis | null>(null);
  readonly proAnalysisLoading = signal(false);
  readonly proAnalysisError = signal<InsightsClientError | null>(null);
  readonly proAnalysisStale = computed(() => {
    const a = this.proAnalysis();
    if (!a) return true;
    return Date.now() - new Date(a.generatedAt).getTime() > CACHE_TTL_MS;
  });

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

    if (this.isPro()) {
      const cached = await this.cacheStorage.loadCache();
      if (cached && !this.isStaleAnalysis(cached.analysis)) {
        this.proAnalysis.set(cached.analysis);
      }
    }
  }

  async triggerProAnalysis(): Promise<void> {
    this.proAnalysisLoading.set(true);
    this.proAnalysisError.set(null);

    const payload = this.buildPayload();

    try {
      const analysis = await this.llmClient.analyze(payload);
      await this.cacheStorage.saveCache(analysis);
      this.proAnalysis.set(analysis);
    } catch (err: any) {
      const code: InsightsClientError = err?.code ?? 'ANALYSIS_FAILED';
      this.proAnalysisError.set(code);
    } finally {
      this.proAnalysisLoading.set(false);
    }
  }

  private buildPayload(): InsightsAnalysisPayload {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;

    const recentEvents = this.events()
      .filter(e => new Date(e.timestamp).getTime() >= cutoff)
      .filter(e => e.eventType === 'ADD' || e.eventType === 'CONSUME' || e.eventType === 'EXPIRE')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 200)
      .map(e => ({
        eventType: e.eventType as 'ADD' | 'CONSUME' | 'EXPIRE',
        foodType: e.foodType,
        timestamp: e.timestamp,
        productName: e.productName,
      }));

    const snap = this.inventorySnapshot();
    return {
      events: recentEvents,
      snapshot: {
        total: snap.total,
        expired: snap.expired,
        review: snap.review,
        nearExpiry: snap.nearExpiry,
        basicsOutOfStock: snap.basicsOutOfStock,
      },
    };
  }

  private isStaleAnalysis(analysis: InsightsAnalysis): boolean {
    return Date.now() - new Date(analysis.generatedAt).getTime() > CACHE_TTL_MS;
  }
}
