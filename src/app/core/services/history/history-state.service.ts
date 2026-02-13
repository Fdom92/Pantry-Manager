import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { PantryEvent } from '@core/models/events';
import { formatDateValue, formatQuantity, formatTimeValue } from '@core/utils/formatting.util';
import { normalizeTrim } from '@core/utils/normalization.util';
import { HistoryEventLogService } from './history-event-log.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { LanguageService } from '../shared/language.service';
import { withSignalFlag } from '@core/utils';
import { TranslateService } from '@ngx-translate/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

type HistoryEventKind = 'added' | 'consumed' | 'expired' | 'edited' | 'deleted';
type HistoryFilterKey = 'all' | 'added' | 'consumed' | 'edited' | 'expired' | 'deleted';

type HistoryEventMeta = {
  kind: HistoryEventKind;
  icon: string;
  subtitleKey: string;
  showQuantity: boolean;
  signedQuantity: boolean;
};

type HistoryFilterDefinition = {
  key: HistoryFilterKey;
  labelKey: string;
  icon: string;
  colorClass: string;
  eventType?: PantryEvent['eventType'];
};

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

const HISTORY_FILTER_DEFINITIONS: HistoryFilterDefinition[] = [
  { key: 'all', labelKey: 'history.filters.all', icon: 'layers-outline', colorClass: 'chip--all' },
  { key: 'added', labelKey: 'history.filters.added', icon: 'add-circle-outline', colorClass: 'chip--added', eventType: 'ADD' },
  { key: 'consumed', labelKey: 'history.filters.consumed', icon: 'remove-circle-outline', colorClass: 'chip--consumed', eventType: 'CONSUME' },
  { key: 'edited', labelKey: 'history.filters.edited', icon: 'create-outline', colorClass: 'chip--edited', eventType: 'EDIT' },
  { key: 'expired', labelKey: 'history.filters.expired', icon: 'alert-circle-outline', colorClass: 'chip--expired', eventType: 'EXPIRE' },
  { key: 'deleted', labelKey: 'history.filters.deleted', icon: 'trash-outline', colorClass: 'chip--deleted', eventType: 'DELETE' },
];

const EVENT_META_BY_TYPE: Record<PantryEvent['eventType'], HistoryEventMeta> = {
  ADD: {
    kind: 'added',
    icon: 'add-circle-outline',
    subtitleKey: 'history.eventTypes.added',
    showQuantity: true,
    signedQuantity: true,
  },
  CONSUME: {
    kind: 'consumed',
    icon: 'remove-circle-outline',
    subtitleKey: 'history.eventTypes.consumed',
    showQuantity: true,
    signedQuantity: true,
  },
  EDIT: {
    kind: 'edited',
    icon: 'create-outline',
    subtitleKey: 'history.event.editedTitle',
    showQuantity: false,
    signedQuantity: false,
  },
  EXPIRE: {
    kind: 'expired',
    icon: 'alert-circle-outline',
    subtitleKey: 'history.eventTypes.expired',
    showQuantity: true,
    signedQuantity: false,
  },
  DELETE: {
    kind: 'deleted',
    icon: 'trash-outline',
    subtitleKey: 'history.eventTypes.deleted',
    showQuantity: true,
    signedQuantity: true,
  },
};

const getHistoryEventMeta = (event: PantryEvent): HistoryEventMeta =>
  EVENT_META_BY_TYPE[event.eventType] ?? EVENT_META_BY_TYPE.EDIT;

@Injectable()
export class HistoryStateService {
  private readonly eventLog = inject(HistoryEventLogService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });

  readonly loading = signal(false);
  readonly events = signal<PantryEvent[]>([]);
  readonly activeFilter = signal<HistoryFilterKey>('all');
  readonly skeletonPlaceholders = Array.from({ length: 6 }, (_, index) => index);

  private readonly productMap = computed(() =>
    new Map(this.pantryStore.items().map(item => [item._id, item] as const))
  );

  readonly visibleEvents = computed(() => {
    const events = this.events();
    if (this.isPro()) {
      return events;
    }
    return events.slice(0, 20);
  });

  readonly canSeeMore = computed(() =>
    !this.isPro() && this.events().length > 20 && this.eventCards().length > 0
  );

  readonly filterChips = computed<HistoryFilterChip[]>(() => {
    const events = this.visibleEvents();
    const counts = this.buildFilterCounts(events);

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
    const groupsMap = new Map<string, HistoryDayGroup>();
    const events = this.eventCards();

    for (const event of events) {
      const dayKey = this.getDayKey(event.timestamp, event.id);
      const existing = groupsMap.get(dayKey);
      if (existing) {
        existing.events.push(event);
        continue;
      }
      groupsMap.set(dayKey, {
        key: dayKey,
        label: formatDateValue(event.timestamp, locale, undefined, { fallback: event.timestamp }),
        events: [event],
      });
    }

    return Array.from(groupsMap.values());
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
      const filtered = events.filter(event => (event.eventType as string) !== 'IMPORT');
      this.events.set(filtered);
    } catch (err) {
      console.error('[HistoryStateService] refreshEvents error', err);
      this.events.set([]);
    }
  }

  private buildEventCard(event: PantryEvent): HistoryEventCard {
    const locale = this.languageService.getCurrentLocale();
    const productName = normalizeTrim(event.productName)
      || this.productMap().get(event.productId)?.name
      || this.translate.instant('history.event.unknownProduct');
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
    const safeValue = Number.isFinite(value) ? Number(value) : 0;
    const formatted = formatQuantity(Math.abs(safeValue), locale);
    const sign = signed ? (safeValue < 0 ? '-' : safeValue > 0 ? '+' : '') : '';
    return `${sign}${formatted}`;
  }

  private buildFilterCounts(events: PantryEvent[]): Record<HistoryFilterKey, number> {
    const counts: Record<HistoryFilterKey, number> = {
      all: events.length,
      added: 0,
      consumed: 0,
      edited: 0,
      expired: 0,
      deleted: 0,
    };
    for (const event of events) {
      switch (event.eventType) {
        case 'ADD':
          counts.added += 1;
          break;
        case 'CONSUME':
          counts.consumed += 1;
          break;
        case 'EDIT':
          counts.edited += 1;
          break;
        case 'EXPIRE':
          counts.expired += 1;
          break;
        case 'DELETE':
          counts.deleted += 1;
          break;
        default:
          break;
      }
    }
    return counts;
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

}
