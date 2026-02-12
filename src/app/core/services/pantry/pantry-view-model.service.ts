import { Injectable, inject } from '@angular/core';
import { NEAR_EXPIRY_WINDOW_DAYS, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { classifyExpiry, getItemStatusState, normalizeBatches, sumQuantities } from '@core/domain/pantry';
import { generateBatchId, getExpirationSortWeight } from '@core/utils';
import type {
  BatchCountsMeta,
  BatchEntryMeta,
  BatchStatusMeta,
  BatchSummaryMeta,
  FilterChipViewModel,
  ItemBatch,
  PantryGroup,
  PantryItem,
  PantryItemBatchViewModel,
  PantryItemCardViewModel,
  PantryItemGlobalStatus,
  PantryStatusFilterValue,
  PantrySummaryMeta,
  ProductStatusState,
} from '@core/models/pantry';
import { ES_DATE_FORMAT_OPTIONS } from '@core/models/shared';
import { formatDateValue, formatQuantity, roundQuantity, toNumberOrZero } from '@core/utils/formatting.util';
import { formatFriendlyName, normalizeCategoryId, normalizeLowercase, normalizeLocationId, normalizeStringList } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../shared/language.service';

@Injectable({ providedIn: 'root' })
export class PantryViewModelService {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  buildSummary(items: PantryItem[], totalCount: number): PantrySummaryMeta {
    const now = new Date();
    const statusCounts = {
      expired: 0,
      expiring: 0,
      lowStock: 0,
      normal: 0,
    };
    let basicCount = 0;

    for (const item of items) {
      if (item.isBasic) {
        basicCount += 1;
      }

      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      switch (state) {
        case 'expired':
          statusCounts.expired += 1;
          break;
        case 'near-expiry':
          statusCounts.expiring += 1;
          break;
        case 'low-stock':
          statusCounts.lowStock += 1;
          break;
        default:
          statusCounts.normal += 1;
          break;
      }
    }

    return {
      total: totalCount,
      visible: items.length,
      basicCount,
      statusCounts,
    };
  }

  buildFilterChips(
    summary: PantrySummaryMeta,
    activeStatus: PantryStatusFilterValue,
    basicActive: boolean,
  ): FilterChipViewModel[] {
    const counts = summary.statusCounts;
    const statusChips: FilterChipViewModel[] = [
      {
        key: 'status-all',
        kind: 'status',
        value: 'all',
        label: 'pantry.filters.all',
        count: summary.total,
        icon: 'layers-outline',
        description: 'pantry.filters.desc.all',
        colorClass: 'chip--all',
        active: activeStatus === 'all',
      },
      {
        key: 'status-normal',
        kind: 'status',
        value: 'normal',
        label: 'pantry.filters.status.normal',
        count: counts.normal,
        icon: 'checkmark-circle-outline',
        description: 'pantry.filters.desc.normal',
        colorClass: 'chip--normal',
        active: activeStatus === 'normal',
      },
      {
        key: 'status-low',
        kind: 'status',
        value: 'low-stock',
        label: 'pantry.filters.status.low',
        count: counts.lowStock,
        icon: 'alert-circle-outline',
        description: 'pantry.filters.desc.low',
        colorClass: 'chip--low',
        active: activeStatus === 'low-stock',
      },
      {
        key: 'status-expiring',
        kind: 'status',
        value: 'near-expiry',
        label: 'pantry.filters.status.expiring',
        count: counts.expiring,
        icon: 'hourglass-outline',
        description: 'pantry.filters.desc.expiring',
        colorClass: 'chip--expiring',
        active: activeStatus === 'near-expiry',
      },
      {
        key: 'status-expired',
        kind: 'status',
        value: 'expired',
        label: 'pantry.filters.status.expired',
        count: counts.expired,
        icon: 'time-outline',
        description: 'pantry.filters.desc.expired',
        colorClass: 'chip--expired',
        active: activeStatus === 'expired',
      },
    ];

    return statusChips;
  }

  buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();
    const now = new Date();
    const uncategorizedLabel = this.translate.instant('pantry.form.uncategorized');

    for (const item of items) {
      const key = normalizeCategoryId(item.categoryId);
      const name = formatFriendlyName(key, uncategorizedLabel);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          items: [],
          lowStockCount: 0,
          expiringCount: 0,
          expiredCount: 0,
        };
        map.set(key, group);
      }

      group.items.push(item);
      const state = getItemStatusState(item, now, NEAR_EXPIRY_WINDOW_DAYS);
      if (state === 'low-stock') {
        group.lowStockCount += 1;
      } else if (state === 'expired') {
        group.expiredCount += 1;
      } else if (state === 'near-expiry') {
        group.expiringCount += 1;
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const group of groups) {
      group.items = group.items.sort((a, b) => this.compareItems(a, b));
    }
    return groups;
  }

  computeBatchSummaries(items: PantryItem[]): Map<string, BatchSummaryMeta> {
    const summaries = new Map<string, BatchSummaryMeta>();
    for (const item of items) {
      const collected = this.collectBatches(item);
      if (!collected.length) {
        summaries.set(item._id, { total: 0, sorted: [] });
        continue;
      }
      const sorted = collected
        .sort((a, b) => {
          const aTime = this.getBatchTime(a.batch);
          const bTime = this.getBatchTime(b.batch);
          if (aTime === bTime) {
            return 0;
          }
          if (aTime === null) {
            return 1;
          }
          if (bTime === null) {
            return -1;
          }
          return aTime - bTime;
        })
        .map(entry => ({
          batch: entry.batch,
          locationId: entry.locationId,
          locationLabel: entry.locationLabel,
          status: entry.status,
        }));

      summaries.set(item._id, {
        total: collected.length,
        sorted,
      });
    }
    return summaries;
  }

  buildItemCardViewModel(params: {
    item: PantryItem;
    summary: BatchSummaryMeta;
    totalQuantity: number;
    totalBatches: number;
  }): PantryItemCardViewModel {
    const { item, summary, totalQuantity, totalBatches } = params;
    const locale = this.languageService.getCurrentLocale();
    const formattedQuantityValue = formatQuantity(totalQuantity, locale);
    const totalQuantityLabel = this.translate.instant('pantry.detail.totalQuantity', {
      value: formattedQuantityValue,
    });
    const totalBatchesLabel = this.translate.instant(
      totalBatches === 1 ? 'pantry.detail.batches.single' : 'pantry.detail.batches.plural',
      { count: totalBatches }
    );

    const batches = summary.sorted.map(entry => ({
      batch: entry.batch,
      locationId: entry.locationId,
      locationLabel: entry.locationLabel,
      hasLocation: normalizeLowercase(entry.locationId) !== normalizeLowercase(UNASSIGNED_LOCATION_KEY),
      status: entry.status,
      formattedDate: this.formatBatchDate(entry.batch),
      quantityLabel: this.formatBatchQuantity(entry.batch),
      quantityValue: toNumberOrZero(entry.batch.quantity),
      opened: Boolean(entry.batch.opened),
    }));

    const lowStock = getItemStatusState(item, new Date(), NEAR_EXPIRY_WINDOW_DAYS) === 'low-stock';
    const aggregates = this.computeProductAggregates(batches, lowStock);
    const colorClass = this.getColorClass(aggregates.status.state);
    const fallbackLabel = this.translate.instant('common.dates.none');
    const formattedEarliestExpirationLong = aggregates.earliestDate
      ? formatDateValue(aggregates.earliestDate, locale, ES_DATE_FORMAT_OPTIONS.numeric, {
          fallback: aggregates.earliestDate,
        })
      : fallbackLabel;

    return {
      item,
      totalQuantity,
      totalQuantityLabel,
      totalBatches,
      totalBatchesLabel,
      globalStatus: aggregates.status,
      colorClass,
      earliestExpirationDate: aggregates.earliestDate,
      formattedEarliestExpirationLong,
      batchCountsLabel: aggregates.batchSummaryLabel,
      batchCounts: aggregates.counts,
      batches,
    };
  }

  formatBatchDate(batch: ItemBatch): string {
    const value = batch.expirationDate;
    if (!value) {
      return this.translate.instant('common.dates.none');
    }
    return formatDateValue(value, this.languageService.getCurrentLocale(), ES_DATE_FORMAT_OPTIONS.numeric, {
      fallback: value,
    });
  }

  formatBatchQuantity(batch: ItemBatch): string {
    return formatQuantity(toNumberOrZero(batch.quantity), this.languageService.getCurrentLocale());
  }

  getBatchStatus(batch: ItemBatch): BatchStatusMeta {
    const state = classifyExpiry(batch.expirationDate, new Date(), NEAR_EXPIRY_WINDOW_DAYS);
    switch (state) {
      case 'expired':
        return {
          label: this.translate.instant('dashboard.expired.badge'),
          icon: 'alert-circle-outline',
          state: 'expired',
          color: 'danger',
        };
      case 'near-expiry':
        return {
          label: this.translate.instant('dashboard.summary.stats.nearExpiry'),
          icon: 'hourglass-outline',
          state: 'near-expiry',
          color: 'warning',
        };
      case 'normal':
        return {
          label: this.translate.instant('pantry.filters.status.normal'),
          icon: 'checkmark-circle-outline',
          state: 'normal',
          color: 'success',
        };
      default:
        return {
          label: this.translate.instant('common.dates.none'),
          icon: 'remove-circle-outline',
          state: 'unknown',
          color: 'medium',
        };
    }
  }

  getLocationLabel(locationId: string | undefined): string {
    return normalizeLocationId(locationId, this.translate.instant('common.locations.none'));
  }

  normalizeLocationOptions(options: string[] | null | undefined): string[] {
    return normalizeStringList(options, { fallback: [] });
  }

  private compareItems(a: PantryItem, b: PantryItem): number {
    const expirationWeightDiff = getExpirationSortWeight(a) - getExpirationSortWeight(b);
    if (expirationWeightDiff !== 0) {
      return expirationWeightDiff;
    }

    return (a.name ?? '').localeCompare(b.name ?? '');
  }


  private collectBatches(item: PantryItem): BatchEntryMeta[] {
    const batches: BatchEntryMeta[] = [];
    for (const batch of normalizeBatches(item.batches ?? [], { generateBatchId })) {
      const locationId = normalizeLocationId(batch.locationId, UNASSIGNED_LOCATION_KEY);
      const locationLabel = this.getLocationLabel(locationId);
      batches.push({
        batch: { ...batch, locationId },
        locationId,
        locationLabel,
        status: this.getBatchStatus(batch),
      });
    }
    return batches;
  }


  private getBatchTime(batch: ItemBatch): number | null {
    if (!batch.expirationDate) {
      return null;
    }
    const time = new Date(batch.expirationDate).getTime();
    return Number.isFinite(time) ? time : null;
  }

  private computeProductAggregates(
    batches: PantryItemBatchViewModel[],
    isLowStock: boolean
  ): {
    status: PantryItemGlobalStatus;
    earliestDate: string | null;
    counts: BatchCountsMeta;
    batchSummaryLabel: string;
  } {
    const counts: BatchCountsMeta = {
      total: batches.length,
      expired: 0,
      nearExpiry: 0,
      normal: 0,
      unknown: 0,
    };

    let earliestDate: string | null = null;
    let earliestTime: number | null = null;
    let earliestStatus: ProductStatusState | null = null;

    for (const entry of batches) {
      switch (entry.status.state) {
        case 'expired':
          counts.expired += 1;
          break;
        case 'near-expiry':
          counts.nearExpiry += 1;
          break;
        case 'normal':
          counts.normal += 1;
          break;
        default:
          counts.unknown += 1;
          break;
      }

      if (entry.batch.expirationDate) {
        const time = this.getBatchTime(entry.batch);
        if (time !== null && (earliestTime === null || time < earliestTime)) {
          earliestTime = time;
          earliestDate = entry.batch.expirationDate;
          earliestStatus =
            entry.status.state === 'normal' || entry.status.state === 'unknown'
              ? 'normal'
              : (entry.status.state as Extract<ProductStatusState, 'expired' | 'near-expiry'>);
        }
      }
    }

    let statusState: ProductStatusState;
    if (earliestStatus === 'expired') {
      statusState = 'expired';
    } else if (earliestStatus === 'near-expiry') {
      statusState = 'near-expiry';
    } else if (isLowStock) {
      statusState = 'low-stock';
    } else {
      statusState = 'normal';
    }

    const status = this.getProductStatusMeta(statusState);
    const batchSummaryLabel = this.buildBatchSummaryLabel(counts);

    return {
      status,
      earliestDate,
      counts,
      batchSummaryLabel,
    };
  }

  private getColorClass(state: ProductStatusState): string {
    switch (state) {
      case 'expired':
        return 'state-expired';
      case 'near-expiry':
        return 'state-expiring';
      case 'low-stock':
        return 'state-low-stock';
      default:
        return 'state-ok';
    }
  }

  private getProductStatusMeta(state: ProductStatusState): PantryItemGlobalStatus {
    switch (state) {
      case 'expired':
        return {
          state,
          label: this.translate.instant('pantry.filters.status.expired'),
          accentColor: 'var(--ion-color-danger)',
          chipColor: 'var(--ion-color-danger)',
          chipTextColor: 'var(--ion-color-dark-contrast)',
        };
      case 'near-expiry':
        return {
          state,
          label: this.translate.instant('pantry.filters.status.expiring'),
          accentColor: 'var(--ion-color-warning)',
          chipColor: 'var(--ion-color-warning)',
          chipTextColor: 'var(--ion-text-color)',
        };
      case 'low-stock':
        return {
          state,
          label: this.translate.instant('pantry.filters.status.low'),
          accentColor: 'var(--ion-color-warning)',
          chipColor: 'var(--ion-color-warning)',
          chipTextColor: 'var(--ion-color-dark)',
        };
      default:
        return {
          state: 'normal',
          label: this.translate.instant('pantry.filters.status.normal'),
          accentColor: 'var(--ion-color-primary)',
          chipColor: 'var(--ion-color-primary)',
          chipTextColor: 'var(--ion-color-primary-contrast)',
        };
    }
  }

  private buildBatchSummaryLabel(counts: BatchCountsMeta): string {
    if (!counts.total) {
      return this.translate.instant('pantry.detail.batchSummary.none');
    }

    const descriptors: string[] = [];
    if (counts.expired) {
      const key =
        counts.expired === 1
          ? 'pantry.detail.batchSummary.expired.single'
          : 'pantry.detail.batchSummary.expired.plural';
      descriptors.push(this.translate.instant(key, { count: counts.expired }));
    }
    if (counts.nearExpiry) {
      const key =
        counts.nearExpiry === 1
          ? 'pantry.detail.batchSummary.nearExpiry.single'
          : 'pantry.detail.batchSummary.nearExpiry.plural';
      descriptors.push(this.translate.instant(key, { count: counts.nearExpiry }));
    }
    if (counts.normal) {
      const key =
        counts.normal === 1 ? 'pantry.detail.batchSummary.normal.single' : 'pantry.detail.batchSummary.normal.plural';
      descriptors.push(this.translate.instant(key, { count: counts.normal }));
    }
    if (counts.unknown) {
      const key =
        counts.unknown === 1
          ? 'pantry.detail.batchSummary.unknown.single'
          : 'pantry.detail.batchSummary.unknown.plural';
      descriptors.push(this.translate.instant(key, { count: counts.unknown }));
    }

    const totalLabel = this.translate.instant(
      counts.total === 1 ? 'pantry.detail.batchSummary.total.single' : 'pantry.detail.batchSummary.total.plural',
      { count: counts.total }
    );
    if (!descriptors.length) {
      return totalLabel;
    }

    return this.translate.instant('pantry.detail.batchSummary.withDescriptors', {
      total: totalLabel,
      descriptors: descriptors.join(', '),
    });
  }
}
