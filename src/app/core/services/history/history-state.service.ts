import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { PantryEvent } from '@core/models/events';
import { formatDateValue, formatQuantity, formatTimeValue } from '@core/utils/formatting.util';
import { EventLogService } from '../events';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { LanguageService } from '../shared/language.service';
import { withSignalFlag } from '../shared';
import { TranslateService } from '@ngx-translate/core';
import { RevenuecatService } from '../upgrade/revenuecat.service';

export type HistoryFilterKey = 'all' | 'added' | 'consumed' | 'edited' | 'expired' | 'deleted';

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
  kind: 'added' | 'consumed' | 'expired' | 'edited' | 'deleted';
};

type HistoryDayGroup = {
  key: string;
  label: string;
  events: HistoryEventCard[];
};

const FILTER_DEFINITIONS: Array<Omit<HistoryFilterChip, 'count' | 'active'>> = [
  { key: 'all', labelKey: 'history.filters.all', icon: 'layers-outline', colorClass: 'chip--all' },
  { key: 'added', labelKey: 'history.filters.added', icon: 'add-circle-outline', colorClass: 'chip--added' },
  { key: 'consumed', labelKey: 'history.filters.consumed', icon: 'remove-circle-outline', colorClass: 'chip--consumed' },
  { key: 'edited', labelKey: 'history.filters.edited', icon: 'create-outline', colorClass: 'chip--edited' },
  { key: 'expired', labelKey: 'history.filters.expired', icon: 'alert-circle-outline', colorClass: 'chip--expired' },
  { key: 'deleted', labelKey: 'history.filters.deleted', icon: 'trash-outline', colorClass: 'chip--deleted' },
];

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
    const counts = {
      all: events.length,
      added: events.filter(event => event.eventType === 'ADD').length,
      consumed: events.filter(event => event.eventType === 'CONSUME').length,
      edited: events.filter(event => event.eventType === 'EDIT').length,
      expired: events.filter(event => this.isExpiredEvent(event)).length,
      deleted: events.filter(event => event.eventType === 'DELETE').length,
    };

    const active = this.activeFilter();
    return FILTER_DEFINITIONS.map(definition => ({
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
    if (filter === 'added') {
      return events.filter(event => event.eventType === 'ADD');
    }
    if (filter === 'consumed') {
      return events.filter(event => event.eventType === 'CONSUME');
    }
    if (filter === 'edited') {
      return events.filter(event => event.eventType === 'EDIT');
    }
    if (filter === 'expired') {
      return events.filter(event => this.isExpiredEvent(event));
    }
    return events.filter(event => event.eventType === 'DELETE');
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
    const productName = this.productMap().get(event.productId)
      ?? this.translate.instant('history.event.unknownProduct');
    const kind = this.getEventKind(event);
    const subtitle = this.translate.instant(`history.eventTypes.${kind}`);
    const quantityLabel = this.buildQuantityLabel(event, locale);
    const timeLabel = formatTimeValue(event.timestamp, locale, { fallback: '' });

    return {
      id: event._id,
      title: productName,
      subtitle,
      quantityLabel,
      timeLabel,
      timestamp: event.timestamp,
      icon: this.getEventIcon(kind),
      kind,
    };
  }

  private getEventKind(event: PantryEvent): HistoryEventCard['kind'] {
    if (this.isExpiredEvent(event)) {
      return 'expired';
    }
    if (event.eventType === 'ADD') {
      return 'added';
    }
    if (event.eventType === 'CONSUME') {
      return 'consumed';
    }
    if (event.eventType === 'DELETE') {
      return 'deleted';
    }
    return 'edited';
  }

  private getEventIcon(kind: HistoryEventCard['kind']): string {
    switch (kind) {
      case 'added':
        return 'add-circle-outline';
      case 'consumed':
        return 'remove-circle-outline';
      case 'expired':
        return 'alert-circle-outline';
      case 'deleted':
        return 'trash-outline';
      default:
        return 'create-outline';
    }
  }

  private buildQuantityLabel(event: PantryEvent, locale: string): string {
    const value = Number.isFinite(event.deltaQuantity) ? event.deltaQuantity : event.quantity;
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const unit = event.unit ? this.pantryStore.getUnitLabel(event.unit) : '';
    const formatted = formatQuantity(Math.abs(safeValue), locale, { maximumFractionDigits: 2 });
    const sign = safeValue < 0 ? '-' : safeValue > 0 ? '+' : '';
    return `${sign}${formatted}${unit ? ` ${unit}` : ''}`;
  }

  private isExpiredEvent(event: PantryEvent): boolean {
    return event.eventType === 'EXPIRE' || event.reason === 'expired';
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
