import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { PantryEvent } from '@core/models/events';
import {
  HISTORY_FILTER_DEFINITIONS,
  type HistoryFilterKey,
  getHistoryEventMeta,
  type HistoryEventKind,
} from './history-event.mapper';
import { formatDateValue, formatQuantity, formatTimeValue } from '@core/utils/formatting.util';
import { EventLogService } from '../events';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { LanguageService } from '../shared/language.service';
import { withSignalFlag } from '../shared';
import { TranslateService } from '@ngx-translate/core';
import { RevenuecatService } from '../upgrade/revenuecat.service';

type HistoryFilterChip = {
  key: HistoryFilterKey;
  labelKey: string;
  icon: string;
  colorClass: string;
  count: number;
  active: boolean;
};

type HistoryEventCard = {
  id: string;
  title: string;
  subtitle: string;
  quantityLabel: string;
  timeLabel: string;
  timestamp: string;
  icon: string;
  kind: HistoryEventKind;
};

type HistoryDayGroup = {
  key: string;
  label: string;
  events: HistoryEventCard[];
};

@Injectable()
export class HistoryStateService {
  private readonly eventLog = inject(EventLogService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });

  readonly loading = signal(false);
  readonly events = signal<PantryEvent[]>([]);
  readonly activeFilter = signal<HistoryFilterKey>('all');
  readonly skeletonPlaceholders = Array.from({ length: 6 }, (_, index) => index);

  private readonly productMap = computed(() => {
    const map = new Map<string, string>();
    for (const item of this.pantryStore.items()) {
      map.set(item._id, item.name);
    }
    return map;
  });

  readonly visibleEvents = computed(() => {
    const events = this.events();
    if (this.isPro()) {
      return events;
    }
    return events.slice(0, 20);
  });

  readonly canSeeMore = computed(() => !this.isPro() && this.events().length > 20);

  readonly filterChips = computed<HistoryFilterChip[]>(() => {
    const events = this.visibleEvents();
    const counts = HISTORY_FILTER_DEFINITIONS.reduce(
      (acc, definition) => {
        if (definition.key === 'all') {
          acc.all = events.length;
        } else {
          acc[definition.key] = events.filter(event => event.eventType === definition.eventType).length;
        }
        return acc;
      },
      {
        all: 0,
        added: 0,
        consumed: 0,
        edited: 0,
        expired: 0,
        deleted: 0,
        imported: 0,
      } as Record<HistoryFilterKey, number>
    );

    const active = this.activeFilter();
    return HISTORY_FILTER_DEFINITIONS.map(definition => ({
      ...definition,
      count: counts[definition.key],
      active: active === definition.key,
    }));
  });

  readonly filteredEvents = computed(() => {
    const events = this.visibleEvents();
    const filter = this.activeFilter();
    if (filter === 'all') {
      return events;
    }
    const definition = HISTORY_FILTER_DEFINITIONS.find(entry => entry.key === filter);
    if (!definition?.eventType) {
      return events;
    }
    return events.filter(event => event.eventType === definition.eventType);
  });

  readonly eventCards = computed<HistoryEventCard[]>(() =>
    this.filteredEvents().map(event => this.buildEventCard(event))
  );

  readonly groupedEvents = computed<HistoryDayGroup[]>(() => {
    const locale = this.languageService.getCurrentLocale();
    const groups: HistoryDayGroup[] = [];
    const events = this.eventCards();

    for (const event of events) {
      const dayKey = this.getDayKey(event.timestamp, event.id);
      const existing = groups.find(group => group.key === dayKey);
      if (existing) {
        existing.events.push(event);
      } else {
        groups.push({
          key: dayKey,
          label: this.formatDayLabel(event.timestamp, locale),
          events: [event],
        });
      }
    }

    return groups;
  });

  async ionViewWillEnter(): Promise<void> {
    await withSignalFlag(this.loading, async () => {
      await Promise.all([
        this.pantryStore.loadAll(),
        this.refreshEvents(),
      ]);
    });
  }

  setFilter(filter: HistoryFilterKey): void {
    this.activeFilter.set(filter);
  }

  private async refreshEvents(): Promise<void> {
    try {
      const events = await this.eventLog.listEvents();
      this.events.set(events);
    } catch (err) {
      console.error('[HistoryStateService] refreshEvents error', err);
      this.events.set([]);
    }
  }

  private buildEventCard(event: PantryEvent): HistoryEventCard {
    const locale = this.languageService.getCurrentLocale();
    const productName = event.entityType === 'import' || event.eventType === 'IMPORT'
      ? this.translate.instant('history.event.importTitle')
      : ((event.productName ?? '').trim()
        || this.productMap().get(event.productId)
        || this.translate.instant('history.event.unknownProduct'));
    const meta = getHistoryEventMeta(event);
    const subtitle = this.translate.instant(meta.subtitleKey);
    const quantityLabel = meta.showQuantity ? this.buildQuantityLabel(event, locale, meta.signedQuantity) : '';
    const timeLabel = meta.kind === 'expired' ? '' : formatTimeValue(event.timestamp, locale, { fallback: '' });

    return {
      id: event._id,
      title: productName,
      subtitle,
      quantityLabel,
      timeLabel,
      timestamp: event.timestamp,
      icon: meta.icon,
      kind: meta.kind,
    };
  }

  private buildQuantityLabel(event: PantryEvent, locale: string, signed: boolean): string {
    const value = Number.isFinite(event.deltaQuantity) ? event.deltaQuantity : event.quantity;
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const unit = event.unit ? this.pantryStore.getUnitLabel(event.unit) : '';
    const formatted = formatQuantity(Math.abs(safeValue), locale, { maximumFractionDigits: 2 });
    const sign = signed ? (safeValue < 0 ? '-' : safeValue > 0 ? '+' : '') : '';
    return `${sign}${formatted}${unit ? ` ${unit}` : ''}`;
  }

  private getDayKey(value: string, fallback: string): string {
    if (!value) {
      return fallback;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return fallback;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDayLabel(value: string, locale: string): string {
    return formatDateValue(value, locale, undefined, { fallback: value });
  }
}
