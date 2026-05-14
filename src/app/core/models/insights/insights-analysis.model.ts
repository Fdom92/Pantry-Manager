export interface InsightsAnalysis {
  patterns: string[];
  problems: string[];
  recommendations: string[];
  suggestions: string[];
  generatedAt: string;
}

export interface InsightsAnalysisPayload {
  events: Array<{
    eventType: 'ADD' | 'CONSUME' | 'EXPIRE';
    foodType?: string;
    timestamp: string;
    productName?: string;
  }>;
  snapshot: {
    total: number;
    expired: number;
    review: number;
    nearExpiry: number;
    basicsOutOfStock: number;
  };
}

export interface InsightsAnalysisCache {
  readonly _id: 'insights-analysis-cache';
  _rev?: string;
  readonly type: 'insights_cache';
  analysis: InsightsAnalysis;
  readonly createdAt: string;
  updatedAt: string;
}
