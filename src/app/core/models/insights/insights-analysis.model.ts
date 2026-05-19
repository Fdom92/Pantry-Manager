export interface InsightsAnalysis {
  patterns: string[];
  problems: string[];
  recommendations: string[];
  suggestions: string[];
  generatedAt: string;
}

export type { InsightsSignalsPayload } from '@core/domain/insights/insights-pro-payload.domain';

export interface InsightsAnalysisCache {
  readonly _id: 'insights-analysis-cache';
  _rev?: string;
  readonly type: 'insights_cache';
  analysis: InsightsAnalysis;
  readonly createdAt: string;
  updatedAt: string;
}
