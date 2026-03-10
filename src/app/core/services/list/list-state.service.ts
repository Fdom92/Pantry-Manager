import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SHOPPING_LIST_NAME } from '@core/constants';
import { determineSuggestionNeed, incrementSummary } from '@core/domain/list';
import { groupSuggestionsBySupermarket } from '@core/utils/list-grouping.util';
import { formatIsoTimestampForFilename } from '@core/domain/settings';
import type { PantryItem } from '@core/models/pantry';
import {
  type ShoppingStateWithItem,
  type ShoppingSuggestionGroupWithItem,
  type ShoppingSuggestionWithItem,
  type ShoppingSummary,
} from '@core/models/list';
import { LanguageService } from '../shared/language.service';
import { createLatestOnlyRunner, SkeletonLoadingManager, withSignalFlag } from '@core/utils';
import { DownloadService, ShareService, shouldSkipShareOutcome } from '../shared';
import { formatDateTimeValue, formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import { normalizeLowercase, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { PantryStoreService } from '../pantry/pantry-store.service';

@Injectable()
export class ListStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareTask = createLatestOnlyRunner(this.destroyRef);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly download = inject(DownloadService);
  private readonly share = inject(ShareService);

  readonly isSharingListInProgress = signal(false);

  readonly shoppingAnalysis = computed<ShoppingStateWithItem>(() => {
    return this.buildShoppingAnalysis(this.items());
  });

  readonly loading = this.pantryStore.loading;
  readonly items = this.pantryStore.loadedProducts;

  private readonly skeletonManager = new SkeletonLoadingManager();
  readonly showSkeleton = this.skeletonManager.showSkeleton;

  async ionViewWillEnter(): Promise<void> {
    this.skeletonManager.startLoading();
    await this.pantryStore.loadAll();
    this.skeletonManager.stopLoading();
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
        return;
      }

      await withSignalFlag(this.isSharingListInProgress, async () => {
        const pdfBlob = this.buildShoppingPdf(state.groupedSuggestions);
        const filename = `${SHOPPING_LIST_NAME}-${formatIsoTimestampForFilename(new Date())}.pdf`;
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

        if (shouldSkipShareOutcome(outcome)) {
          return;
        }

        this.download.downloadBlob(pdfBlob, filename);
      }).catch(async err => {
        if (!isActive()) {
          return;
        }
        console.error('[ListStateService] shareShoppingList error', err);
      });
    });
  }

  private buildShoppingAnalysis(items: PantryItem[]): ShoppingStateWithItem {
    const suggestions: ShoppingSuggestionWithItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    let summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      empty: 0,
      supermarketCount: 0,
    };

    for (const item of items) {
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);

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
          uniqueSupermarkets.add(normalizeLowercase(supermarket));
        }

        suggestions.push({
          item,
          reason,
          suggestedQuantity,
          currentQuantity: roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
          supermarket,
        });

        summary = incrementSummary(summary, reason);
      }
    }

    summary.total = suggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    const unassignedLabel = this.translate.instant('shopping.unassignedSupermarket');
    const groupedSuggestions = groupSuggestionsBySupermarket({
      suggestions,
      labelForUnassigned: unassignedLabel,
    });
    return { suggestions, groupedSuggestions, summary };
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
    const locale = this.languageService.getCurrentLocale();
    const unassignedLabel = this.translate.instant('shopping.unassignedSupermarket');
    const title = this.translate.instant('shopping.share.pdfTitle');
    const generatedOn = this.translate.instant('shopping.share.generatedOn', {
      date: formatDateTimeValue(now, locale, {
        dateOptions: { year: 'numeric', month: 'long', day: 'numeric' },
        timeOptions: { hour: '2-digit', minute: '2-digit' },
        fallback: '',
      }),
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
          quantity: formatQuantity(suggestion.suggestedQuantity, locale),
          supermarket: suggestion.supermarket ?? unassignedLabel,
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

  private ensurePageSpace(doc: jsPDF, currentY: number, neededSpace: number): number {
    const bottomMargin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (currentY + neededSpace > pageHeight - bottomMargin) {
      doc.addPage();
      return 20;
    }
    return currentY;
  }

}
