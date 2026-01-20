import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { UNASSIGNED_LOCATION_KEY, SHOPPING_LIST_NAME } from '@core/constants';
import { determineSuggestionNeed, groupSuggestionsBySupermarket, incrementSummary } from '@core/domain/shopping';
import { formatIsoTimestampForFilename } from '@core/domain/settings';
import type { PantryItem } from '@core/models/pantry';
import type { MeasurementUnit } from '@core/models/shared';
import type {
  ShoppingReason,
  ShoppingStateWithItem,
  ShoppingSuggestionGroupWithItem,
  ShoppingSuggestionWithItem,
  ShoppingSummary,
} from '@core/models/shopping';
import { ShoppingReasonEnum } from '@core/models/shopping';
import { LanguageService } from '../shared/language.service';
import { DownloadService, ShareService, ToastService, createLatestOnlyRunner, withSignalFlag } from '../shared';
import { formatDateTimeValue, formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import { normalizeLocationId, normalizeSupermarketValue, normalizeUnitValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { PantryService } from '../pantry/pantry.service';
import { PantryStoreService } from '../pantry/pantry-store.service';

@Injectable()
export class ShoppingStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareTask = createLatestOnlyRunner(this.destroyRef);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly download = inject(DownloadService);
  private readonly share = inject(ShareService);

  readonly loading = this.pantryStore.loading;
  readonly items = this.pantryStore.items;

  readonly isSummaryExpanded = signal(true);
  readonly processingSuggestionIds = signal<Set<string>>(new Set());
  readonly isSharingListInProgress = signal(false);

  // Purchase modal (template-driven; state holds only the target + open flag)
  readonly isPurchaseModalOpen = signal(false);
  readonly purchaseTarget = signal<ShoppingSuggestionWithItem | null>(null);

  readonly shoppingAnalysis = computed<ShoppingStateWithItem>(() => {
    const analysis = this.buildShoppingAnalysis(this.items());
    return {
      ...analysis,
      hasAlerts: analysis.summary.total > 0,
    };
  });

  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  toggleSummaryCard(): void {
    this.isSummaryExpanded.update(isOpen => !isOpen);
  }

  isSuggestionProcessing(id: string | undefined): boolean {
    return id ? this.processingSuggestionIds().has(id) : false;
  }

  openPurchaseModalForSuggestion(suggestion: ShoppingSuggestionWithItem): void {
    this.purchaseTarget.set(suggestion);
    this.isPurchaseModalOpen.set(true);
  }

  closePurchaseModal(): void {
    if (this.isPurchaseModalOpen()) {
      return;
    }
    this.isPurchaseModalOpen.set(false);
    this.purchaseTarget.set(null);
  }

  dismissPurchaseModal(): void {
    this.isPurchaseModalOpen.set(false);
  }

  async confirmPurchaseForTarget(data: { quantity: number; expiryDate?: string | null; location: string }): Promise<void> {
    const suggestion = this.purchaseTarget();
    const id = suggestion?.item?._id;
    if (!suggestion || !id || this.isSuggestionProcessing(id)) {
      return;
    }

    this.processingSuggestionIds.update(ids => new Set(ids).add(id));
    try {
      await this.pantryService.addNewLot(id, {
        quantity: data.quantity,
        expiryDate: data.expiryDate ?? undefined,
        location: data.location,
      });
      await this.pantryStore.loadAll();
      this.dismissPurchaseModal();
    } finally {
      this.processingSuggestionIds.update(ids => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  getBadgeColorByReason(reason: ShoppingReason): string {
    switch (reason) {
      case ShoppingReasonEnum.EMPTY:
        return 'danger';
      case ShoppingReasonEnum.BELOW_MIN:
        return 'warning';
      default:
        return 'primary';
    }
  }

  getUnitLabel(unit: MeasurementUnit | string): string {
    return this.pantryStore.getUnitLabel(normalizeUnitValue(unit));
  }

  getLocationLabel(locationId: string): string {
    return normalizeLocationId(locationId, this.translate.instant('common.locations.none'));
  }

  getSuggestionTrackId(suggestion: ShoppingSuggestionWithItem): string {
    return suggestion.item?._id ?? suggestion.item?.name ?? 'item';
  }

  async shareShoppingListReport(): Promise<void> {
    await this.shareTask.run(async isActive => {
      if (this.isSharingListInProgress()) {
        return;
      }

      const state = this.shoppingAnalysis();
      if (!state.summary.total) {
        if (isActive()) {
          await this.presentToast(this.translate.instant('shopping.share.empty'), 'medium');
        }
        return;
      }

      await withSignalFlag(this.isSharingListInProgress, async () => {
        const pdfBlob = this.buildShoppingPdf(state.groupedSuggestions);
        const filename = this.buildShareFileName();
        const { outcome } = await this.share.tryShareBlob({
          blob: pdfBlob,
          filename,
          mimeType: 'application/pdf',
          title: this.translate.instant('shopping.share.dialogTitle'),
          text: this.translate.instant('shopping.share.dialogText'),
        });

        if (!isActive()) {
          return;
        }

        if (outcome === 'shared') {
          await this.presentToast(this.translate.instant('shopping.share.ready'), 'success');
          return;
        }

        if (outcome === 'cancelled') {
          return;
        }

        this.download.downloadBlob(pdfBlob, filename);
        await this.presentToast(this.translate.instant('shopping.share.saved'), 'success');
      }).catch(async err => {
        if (!isActive()) {
          return;
        }
        console.error('[ShoppingStateService] shareShoppingList error', err);
        await this.presentToast(this.translate.instant('shopping.share.error'), 'danger');
      });
    });
  }

  private buildShoppingAnalysis(items: PantryItem[]): Omit<ShoppingStateWithItem, 'hasAlerts'> {
    const suggestions: ShoppingSuggestionWithItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    const summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      empty: 0,
      supermarketCount: 0,
    };

    for (const item of items) {
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      const primaryLocation = item.locations[0];
      const locationId = primaryLocation?.locationId ?? UNASSIGNED_LOCATION_KEY;
      const unit = normalizeUnitValue(primaryLocation?.unit ?? this.pantryStore.getItemPrimaryUnit(item));

      const shouldAutoAdd = this.pantryStore.shouldAutoAddToShoppingList(item, {
        totalQuantity,
        minThreshold,
      });

      if (!shouldAutoAdd) {
        continue;
      }

      const { reason, suggestedQuantity } = determineSuggestionNeed({ totalQuantity, minThreshold });

      if (reason) {
        const supermarket = normalizeSupermarketValue(item.supermarket);
        if (supermarket) {
          uniqueSupermarkets.add(supermarket.toLowerCase());
        }

        suggestions.push({
          item,
          locationId,
          reason,
          suggestedQuantity,
          currentQuantity: roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
          unit,
          supermarket,
        });

        incrementSummary(summary, reason);
      }
    }

    summary.total = suggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    const groupedSuggestions = groupSuggestionsBySupermarket({
      suggestions,
      labelForUnassigned: this.getUnassignedSupermarketLabel(),
    });
    return { suggestions, groupedSuggestions, summary };
  }

  private getUnassignedSupermarketLabel(): string {
    return this.translate.instant('shopping.unassignedSupermarket');
  }

  private buildShoppingPdf(groups: ShoppingSuggestionGroupWithItem[]): Blob {
    const doc = new jsPDF();
    const now = new Date();
    const marginX = 14;
    const lineHeight = 6;
    const columnX = {
      product: marginX,
      quantity: 110,
      supermarket: 150,
    };
    const columnWidth = {
      product: 90,
      quantity: 30,
      supermarket: 45,
    };
    const title = this.translate.instant('shopping.share.pdfTitle');
    const generatedOn = this.translate.instant('shopping.share.generatedOn', {
      date: this.formatExportDate(now),
    });

    doc.setFontSize(16);
    doc.text(title, marginX, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(generatedOn, marginX, 26);
    doc.setTextColor(0);

    let y = 34;
    doc.setFontSize(12);
    y += lineHeight;

    for (const group of groups) {
      if (!group.suggestions.length) {
        continue;
      }

      y = this.ensurePageSpace(doc, y, lineHeight);
      doc.setFont('helvetica', 'bold');
      doc.text(group.label, marginX, y);
      doc.setFont('helvetica', 'normal');
      y += lineHeight;

      for (const suggestion of group.suggestions) {
        const row = {
          product: suggestion.item?.name ?? '',
          quantity: this.formatQuantityLabel(suggestion.suggestedQuantity, suggestion.unit),
          supermarket: suggestion.supermarket ?? this.getUnassignedSupermarketLabel(),
        };
        const productLines = doc.splitTextToSize(row.product, columnWidth.product);
        const quantityLines = doc.splitTextToSize(row.quantity, columnWidth.quantity);
        const maxLines = Math.max(productLines.length, quantityLines.length);
        const neededSpace = maxLines * lineHeight + 2;

        y = this.ensurePageSpace(doc, y, neededSpace);
        for (let i = 0; i < maxLines; i += 1) {
          const offsetY = y + i * lineHeight;
          if (productLines[i]) {
            doc.text(productLines[i], columnX.product, offsetY);
          }
          if (quantityLines[i]) {
            doc.text(quantityLines[i], columnX.quantity, offsetY);
          }
        }
        y += neededSpace;
      }
    }

    return doc.output('blob') as Blob;
  }

  private formatExportDate(date: Date): string {
    return formatDateTimeValue(date, this.languageService.getCurrentLocale(), {
      dateOptions: { year: 'numeric', month: 'long', day: 'numeric' },
      timeOptions: { hour: '2-digit', minute: '2-digit' },
      fallback: '',
    });
  }

  private ensurePageSpace(doc: jsPDF, currentY: number, neededSpace: number): number {
    const bottomMargin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (currentY + neededSpace > pageHeight - bottomMargin) {
      doc.addPage();
      return 20;
    }
    return currentY;
  }

  private formatQuantityLabel(value: number, unit: MeasurementUnit | string): string {
    const locale = this.languageService.getCurrentLocale();
    const formatted = formatQuantity(value, locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(unit);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  }

  private buildShareFileName(): string {
    return `${SHOPPING_LIST_NAME}-${formatIsoTimestampForFilename()}.pdf`;
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'medium'): Promise<void> {
    await this.toast.present(message, { color });
  }
}
