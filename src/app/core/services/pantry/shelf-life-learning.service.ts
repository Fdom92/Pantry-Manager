import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { learnedDaysFor, learnShelfLifeDays } from '@core/domain/pantry';
import type { PantryEvent } from '@core/models/events';
import { HistoryEventLogService } from '../history/history-event-log.service';
import { LoggerService } from '../shared/logger.service';

/**
 * The shelf life this household's own history gives each product, kept current
 * as the event log changes. Read synchronously by the add flows.
 */
@Injectable({ providedIn: 'root' })
export class ShelfLifeLearningService {
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly logger = inject(LoggerService);
  private readonly addEvents = signal<PantryEvent[]>([]);
  private readonly learned = computed(() => learnShelfLifeDays(this.addEvents()));

  constructor() {
    effect(() => {
      this.eventLog.revision();
      void this.eventLog.listEventsByType('ADD')
        .then(events => this.addEvents.set(events))
        .catch(err => this.logger.warn('ShelfLifeLearningService', 'could not read additions', { err }));
    });
  }

  /** Learned days for a product (by id when known, else by name), or undefined with no history. */
  daysFor(name: string | null | undefined, productId?: string): number | undefined {
    return learnedDaysFor(this.learned(), name, productId);
  }
}
