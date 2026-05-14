import { Injectable } from '@angular/core';
import { StorageService } from '../shared/storage.service';
import type { InsightsAnalysis, InsightsAnalysisCache } from '@core/models/insights/insights-analysis.model';

@Injectable({ providedIn: 'root' })
export class InsightsCacheStorageService extends StorageService<InsightsAnalysisCache> {
  private readonly CACHE_ID = 'insights-analysis-cache' as const;

  async loadCache(): Promise<InsightsAnalysisCache | null> {
    return this.get(this.CACHE_ID);
  }

  async saveCache(analysis: InsightsAnalysis): Promise<void> {
    const now = new Date().toISOString();
    await this.save({
      _id: this.CACHE_ID,
      type: 'insights_cache',
      analysis,
      createdAt: now,
      updatedAt: now,
    } as InsightsAnalysisCache);
  }
}
