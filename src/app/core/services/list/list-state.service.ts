import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { SHOPPING_LIST_NAME, UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';
import {
  determineSuggestionNeed,
  incrementSummary,
  sortSuggestionsByUrgency,
} from '@core/domain/list';
import { groupSuggestionsBySupermarket } from '@core/utils/list-grouping.util';
import { formatIsoTimestampForFilename } from '@core/domain/settings';
import type { PantryItem } from '@core/models/pantry';
import {
  type BoughtItem,
  type ManualItem,
  type ShoppingStateWithItem,
  type ShoppingSuggestionGroupWithItem,
  type ShoppingSuggestionWithItem,
  type ShoppingSummary,
  ShoppingReason,
} from '@core/models/list';
import { FRESH_QTY } from '@core/domain/pantry/fresh.domain';
import { LanguageService } from '../shared/language.service';
import { createDocumentId, createLatestOnlyRunner, SkeletonLoadingManager, withSignalFlag } from '@core/utils';
import { buildAddItemPayload } from '@core/domain/pantry/pantry-builder.domain';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { DownloadService, ShareService, shouldSkipShareOutcome } from '../shared';
import { formatDateTimeValue, formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import { normalizeLowercase, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type jsPDF from 'jspdf';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { ListManualItemsStore } from './list-manual-items.store';

@Injectable()
export class ListStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareTask = createLatestOnlyRunner(this.destroyRef);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly download = inject(DownloadService);
  private readonly share = inject(ShareService);
  private readonly toastController = inject(ToastController);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly analytics = inject(AnalyticsService);
  private readonly manualItemsStore = inject(ListManualItemsStore);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isSharingListInProgress = signal(false);

  // Ephemeral per-visit state — cleared on ionViewWillLeave
  readonly boughtItemIds  = signal<Set<string>>(new Set());
  readonly removedAutoIds = signal<Set<string>>(new Set());

  // Persistent across tab switches — owned by ListManualItemsStore
  readonly manualItems    = this.manualItemsStore.manualItems;
  readonly boughtManuals  = this.manualItemsStore.boughtManuals;

  readonly shoppingAnalysis = computed<ShoppingStateWithItem>(() => {
    return this.buildShoppingAnalysis(
      this.items(),
      this.boughtItemIds(),
      this.removedAutoIds(),
      this.manualItems(),
      this.boughtManuals(),
    );
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

  async ionViewWillLeave(): Promise<void> {
    this.boughtItemIds.set(new Set());
    this.removedAutoIds.set(new Set());
    // Clear the "Comprado" history for manual items too — they have already
    // been added to the pantry by markManualAsBought, so keeping them in the
    // bought-manuals signal would make that section grow forever across
    // shopping trips. The pending (unbought) manualItems signal stays — it
    // survives tab switches by design (S4 refactor).
    this.manualItemsStore.clearBoughtManuals();
  }

  async markAsBought(
    suggestion: ShoppingSuggestionWithItem,
    opts?: { quantityOverride?: number },
  ): Promise<void> {
    const id = suggestion.item._id;
    const name = suggestion.item.name;
    const isFresh = suggestion.reason === ShoppingReason.FRESH_EMPTY
      || suggestion.reason === ShoppingReason.FRESH_LOW;
    this.boughtItemIds.update(set => new Set([...set, id]));

    try {
      const timestamp = new Date().toISOString();
      if (isFresh) {
        const item = suggestion.item;
        const existingBatches = item.batches ?? [];
        const updatedBatches = existingBatches.length > 0
          ? [{ ...existingBatches[0], quantity: FRESH_QTY.sufficient }, ...existingBatches.slice(1)]
          : [{ batchId: `batch-${Date.now()}`, quantity: FRESH_QTY.sufficient }];
        const updatedFresh: PantryItem = {
          ...item,
          batches: updatedBatches,
          updatedAt: timestamp,
        };
        await this.pantryStore.updateItem(updatedFresh);
        await this.eventManager.logAdvancedEdit(item, updatedFresh, 'pantry_card');
      } else {
        const quantity = opts?.quantityOverride && opts.quantityOverride > 0
          ? opts.quantityOverride
          : suggestion.suggestedQuantity;
        const previous = suggestion.item;
        const updated = await this.pantryStore.addNewLot(id, { quantity });
        if (updated) {
          await this.eventManager.logAddExistingItem(previous, updated, quantity, undefined, undefined, timestamp);
        }
      }
      const msg = this.translate.instant('shopping.toasts.bought', { name });
      void this.showToast(msg);
      void this.reviewPrompt.handlePositiveAction();
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BUY_COMPLETED, {
        kind: isFresh ? 'fresh' : 'despensa',
        reason: suggestion.reason,
        quantity_override: Boolean(opts?.quantityOverride && opts.quantityOverride > 0),
      });
    } catch (err) {
      console.error('[ListStateService] markAsBought failed', err);
      this.boughtItemIds.update(set => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }

  async markManualAsBought(id: string, quantity = 1): Promise<void> {
    const item = this.manualItemsStore.markManualAsBought(id);
    if (!item) return;

    // Match the manual entry to an existing pantry product by normalized name.
    // If found → add a new lot. Otherwise create a brand-new pantry item.
    const target = normalizeLowercase(item.name);
    const match = this.items().find(p => normalizeLowercase(p.name) === target);
    const timestamp = new Date().toISOString();

    try {
      if (match) {
        const updated = await this.pantryStore.addNewLot(match._id, { quantity });
        if (updated) {
          await this.pantryStore.updateItem(updated);
          await this.eventManager.logAddExistingItem(match, updated, quantity, undefined, undefined, timestamp);
        }
      } else {
        const base = buildAddItemPayload({
          id: createDocumentId('item'),
          nowIso: timestamp,
          name: item.name,
          quantity,
        });
        const newItem: PantryItem = { ...base, productType: 'pantry' };
        await this.pantryStore.addItem(newItem);
        await this.eventManager.logAddNewItem(newItem, quantity, undefined, timestamp);
      }
      this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
        kind: 'despensa',
        source: 'shopping_manual',
        is_new: !match,
        quantity,
      });
      void this.reviewPrompt.handlePositiveAction();
    } catch (err) {
      console.error('[ListStateService] markManualAsBought add-to-pantry failed', err);
    }

    const msg = this.translate.instant('shopping.toasts.boughtManual', { name: item.name });
    void this.showToast(msg);
  }

  removeAutoItem(id: string): void {
    const name = this.items().find(i => i._id === id)?.name;
    this.removedAutoIds.update(set => new Set([...set, id]));
    if (name) {
      const msg = this.translate.instant('shopping.toasts.ignored', { name });
      void this.showToast(msg);
    }
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ITEM_REMOVED, { source: 'auto' });
  }

  removeManualItem(id: string): void {
    const item = this.manualItemsStore.removeManual(id);
    if (item) {
      const msg = this.translate.instant('shopping.toasts.removedManual', { name: item.name });
      void this.showToast(msg);
    }
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ITEM_REMOVED, { source: 'manual' });
  }

  restoreFromBought(id: string): void {
    this.boughtItemIds.update(set => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    this.manualItemsStore.restoreBoughtManual(id);
  }

  addManualItem(name: string, source: 'user' | 'preset' = 'user'): void {
    this.manualItemsStore.addManualItem(name, source);
  }

  private async showToast(message: string, duration = 2500): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration,
      position: 'bottom',
    });
    await toast.present();
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
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_LIST_SHARED, {
        item_count: state.summary.total,
      });

      await withSignalFlag(this.isSharingListInProgress, async () => {
        const pdfBlob = await this.buildShoppingPdf(state.groupedSuggestions);
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

  private buildShoppingAnalysis(
    items: PantryItem[],
    boughtIds: Set<string>,
    removedIds: Set<string>,
    _manualItems: ManualItem[], // tracked as signal dep so computed re-runs; rendered directly in template
    boughtManuals: BoughtItem[],
  ): ShoppingStateWithItem {
    const pendingSuggestions: ShoppingSuggestionWithItem[] = [];
    const boughtAutoItems: BoughtItem[] = [];
    const ignoredAutoItems: BoughtItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    let summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      empty: 0,
      supermarketCount: 0,
      boughtCount: 0,
    };

    for (const item of items) {
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      const supermarket = normalizeSupermarketValue(item.supermarket);
      const id = item._id;

      // Check bought FIRST — item stays in "Comprado" even after restock
      if (boughtIds.has(id)) {
        boughtAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
        continue;
      }

      const shouldAutoAdd = this.pantryStore.shouldAutoAddToShoppingList(item, {
        totalQuantity,
        minThreshold,
      });

      if (!shouldAutoAdd) {
        continue;
      }

      // Track ignored items so they appear in the "Ocultos ahora" section
      if (removedIds.has(id)) {
        ignoredAutoItems.push({ id, name: item.name, supermarket: supermarket || undefined });
        continue;
      }

      const { reason, suggestedQuantity } = determineSuggestionNeed({
        totalQuantity,
        minThreshold,
        isFresh: item.productType === 'fresh',
      });

      if (reason) {
        if (supermarket) {
          uniqueSupermarkets.add(normalizeLowercase(supermarket));
        }
        pendingSuggestions.push({
          item,
          reason,
          suggestedQuantity,
          currentQuantity: roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? roundQuantity(minThreshold) : undefined,
          supermarket: supermarket || undefined,
        });
        summary = incrementSummary(summary, reason);
      }
    }

    summary.total = pendingSuggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    summary.boughtCount = boughtAutoItems.length + boughtManuals.length;

    const unassignedLabel = this.translate.instant('shopping.unassignedSupermarket');
    const groupedSuggestions = groupSuggestionsBySupermarket({
      suggestions: pendingSuggestions,
      labelForUnassigned: unassignedLabel,
    });

    const sortedGroups = groupedSuggestions.map(group => ({
      ...group,
      suggestions: sortSuggestionsByUrgency(group.suggestions),
    }));

    return {
      suggestions: pendingSuggestions,
      groupedSuggestions: sortedGroups,
      summary,
      allBoughtItems: [...boughtAutoItems, ...boughtManuals],
      allIgnoredItems: ignoredAutoItems,
    };
  }

  private async buildShoppingPdf(groups: ShoppingSuggestionGroupWithItem[]): Promise<Blob> {
    const { default: jsPDF } = await import('jspdf');
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
    const dateStr = formatDateTimeValue(now, locale, {
      dateOptions: { year: 'numeric', month: 'long', day: 'numeric' },
      timeOptions: { hour: '2-digit', minute: '2-digit' },
      fallback: '',
    });
    const generatedOn = this.translate.instant('shopping.share.generatedOn', { date: dateStr });

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
        const isFresh = suggestion.reason === ShoppingReason.FRESH_EMPTY
          || suggestion.reason === ShoppingReason.FRESH_LOW;
        const row = {
          product: suggestion.item?.name ?? '',
          quantity: isFresh ? '' : formatQuantity(suggestion.suggestedQuantity, locale),
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
