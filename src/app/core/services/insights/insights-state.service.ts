import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { InsightsAnalysis, InsightsSignalsPayload } from '@core/models/insights/insights-analysis.model';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { InsightsCacheStorageService } from './insights-cache-storage.service';
import { InsightsLlmClientService } from './insights-llm-client.service';
import type { InsightsClientError } from './insights-llm-client.service';
import { LanguageService } from '../shared/language.service';
import {
  computeActivityMetrics,
  computeDistribution,
  computeInventorySnapshot,
  computePantryScore,
  computeFoodCoverage,
} from '@core/domain/insights/insights-free.domain';
import type {
  ActivityMetrics,
  DistributionMetrics,
  InventorySnapshot,
  PantryScoreResult,
  FoodCoverageResult,
} from '@core/domain/insights/insights-free.domain';
import { getItemStatusState } from '@core/domain/pantry/pantry-status.domain';
import { NEAR_EXPIRY_WINDOW_DAYS } from '@core/constants';
import {
  computeActivitySignals,
  computeCategoryBreakdown,
  computeDerivedFeatures,
  computeInventorySignals,
  computePatternSignals,
  computeProductSignals,
} from '@core/domain/insights/insights-pro-payload.domain';
import type { PantryEvent } from '@core/models/events';

export type { ActivityMetrics, DistributionMetrics, InventorySnapshot };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class InsightsStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly revenueCat = inject(UpgradeRevenuecatService);
  private readonly cacheStorage = inject(InsightsCacheStorageService);
  private readonly llmClient = inject(InsightsLlmClientService);
  private readonly languageService = inject(LanguageService);

  private readonly events = signal<PantryEvent[]>([]);
  readonly isLoadingEvents = signal(true);

  readonly staleCount = computed((): number => {
    const now = Date.now();
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    return this.pantryStore.items().filter(item => {
      const qty = (item.batches ?? []).reduce((s, b) => s + (b.quantity ?? 0), 0);
      if (qty <= 0) return false;
      const updated = new Date(item.updatedAt).getTime();
      return !Number.isNaN(updated) && now - updated > STALE_MS;
    }).length;
  });

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
    computeActivityMetrics(this.events(), 30, new Date(), this.inventorySnapshot().active)
  );

  readonly distribution = computed((): DistributionMetrics =>
    computeDistribution(this.pantryStore.items(), this.events(), new Date(), 30)
  );

  readonly pantryScore = computed((): PantryScoreResult | null => {
    const snapshot = this.inventorySnapshot();
    return computePantryScore(snapshot.total, snapshot.pendientes);
  });

  readonly foodCoverage = computed((): FoodCoverageResult | null => {
    const now = new Date();
    const activeItems = this.pantryStore.items().filter(
      i => getItemStatusState(i, now, NEAR_EXPIRY_WINDOW_DAYS) !== 'expired'
    );
    return computeFoodCoverage(activeItems);
  });

  readonly isPro = toSignal(this.revenueCat.isPro$, { initialValue: this.revenueCat.isPro() });

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
    this.isLoadingEvents.set(true);
    const loaded = await this.eventLog.listEvents();
    this.events.set(loaded);
    this.isLoadingEvents.set(false);

    if (this.isPro()) {
      void this.llmClient.warmup();
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

  private buildPayload(): InsightsSignalsPayload {
    const now = new Date();
    const items = this.pantryStore.items();
    const events = this.events();
    const locale = this.languageService.getCurrentLanguage();

    const signals = computeInventorySignals(items, now);
    const activity = computeActivitySignals(events, 30, now);
    const patterns = computePatternSignals(items, events, now, 30);
    const inventory = computeCategoryBreakdown(items, events, now, 30);
    const products = computeProductSignals(items, events, now, 30);
    const derived = computeDerivedFeatures(signals, activity, inventory);

    return { locale, signals, inventory, activity, patterns, products, derived };
  }

  private isStaleAnalysis(analysis: InsightsAnalysis): boolean {
    return Date.now() - new Date(analysis.generatedAt).getTime() > CACHE_TTL_MS;
  }
}
