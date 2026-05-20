import { Injectable, inject } from '@angular/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import type { InsightsAnalysis, InsightsSignalsPayload } from '@core/models/insights/insights-analysis.model';
import { environment } from 'src/environments/environment';

export type InsightsClientError = 'RATE_LIMIT' | 'TIMEOUT' | 'PRO_REQUIRED' | 'ANALYSIS_FAILED';

@Injectable({ providedIn: 'root' })
export class InsightsLlmClientService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.insightsApiUrl;
  private readonly timeoutMs = 45000;
  private warmupInFlight = false;

  async analyze(payload: InsightsSignalsPayload): Promise<InsightsAnalysis> {
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

    const isStringArray = (v: unknown) =>
      Array.isArray(v) && v.every(i => typeof i === 'string');

    if (
      !analysis ||
      !isStringArray(analysis.patterns) ||
      !isStringArray(analysis.problems) ||
      !isStringArray(analysis.recommendations) ||
      !isStringArray(analysis.suggestions)
    ) {
      throw this.makeError('ANALYSIS_FAILED');
    }

    return analysis as InsightsAnalysis;
  }

  async warmup(): Promise<void> {
    if (!this.endpoint || this.warmupInFlight) return;
    let healthUrl: string;
    try {
      healthUrl = new URL(this.endpoint).origin + '/health';
    } catch {
      return;
    }
    this.warmupInFlight = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      await fetch(healthUrl, { method: 'GET', signal: controller.signal });
    } catch {
      // best-effort
    } finally {
      clearTimeout(timeoutId);
      this.warmupInFlight = false;
    }
  }

  private makeError(code: InsightsClientError): Error & { code: InsightsClientError } {
    return Object.assign(new Error(code), { code });
  }
}
