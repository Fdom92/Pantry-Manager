import { Injectable, inject } from '@angular/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import type { InsightsAnalysis, InsightsAnalysisPayload } from '@core/models/insights/insights-analysis.model';
import { environment } from 'src/environments/environment';

export type InsightsClientError = 'RATE_LIMIT' | 'TIMEOUT' | 'PRO_REQUIRED' | 'ANALYSIS_FAILED';

@Injectable({ providedIn: 'root' })
export class InsightsLlmClientService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.insightsApiUrl;
  private readonly timeoutMs = 20000;

  async analyze(payload: InsightsAnalysisPayload): Promise<InsightsAnalysis> {
    if (!this.endpoint) {
      throw this.makeError('ANALYSIS_FAILED');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const userId = this.revenuecat.getUserId();
    if (userId) headers['x-user-id'] = userId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw this.makeError('TIMEOUT');
      throw this.makeError('ANALYSIS_FAILED');
    }

    if (response.status === 403) throw this.makeError('PRO_REQUIRED');
    if (response.status === 429) throw this.makeError('RATE_LIMIT');
    if (!response.ok) throw this.makeError('ANALYSIS_FAILED');

    const body = await response.json();
    const analysis = body?.analysis;

    if (
      !analysis ||
      !Array.isArray(analysis.patterns) ||
      !Array.isArray(analysis.problems) ||
      !Array.isArray(analysis.recommendations) ||
      !Array.isArray(analysis.suggestions)
    ) {
      throw this.makeError('ANALYSIS_FAILED');
    }

    return analysis as InsightsAnalysis;
  }

  private makeError(code: InsightsClientError): Error & { code: InsightsClientError } {
    return Object.assign(new Error(code), { code });
  }
}
