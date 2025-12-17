import { Injectable, signal } from '@angular/core';
import { Insight, InsightTrigger } from './insight.types';

@Injectable({ providedIn: 'root' })
export class InsightService {
  private readonly insights = signal<Insight[]>([]);

  getInsights(trigger: InsightTrigger): Insight[] {
    return this.insights().filter(insight => insight.trigger === trigger);
  }

  addInsight(insight: Insight): void {
    this.insights.update(list => [...list, insight]);
  }

  dismissInsight(insightId: string): void {
    this.insights.update(list => list.filter(insight => insight.id !== insightId));
  }

  clearTrigger(trigger: InsightTrigger): void {
    this.insights.update(list => list.filter(insight => insight.trigger !== trigger));
  }

  clearAll(): void {
    this.insights.set([]);
  }
}
