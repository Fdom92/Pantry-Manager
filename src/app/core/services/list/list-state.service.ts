import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ActionSheetController, ToastController } from '@ionic/angular';
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
  private readonly actionSheetCtrl = inject(ActionSheetController);
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

  async openShareMenu(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      buttons: [
        {
          text: this.translate.instant('shopping.share.actionPdf'),
          icon: 'document-outline',
          handler: () => { void this.shareShoppingListReport(); },
        },
        {
          text: this.translate.instant('shopping.share.actionText'),
          icon: 'chatbubble-outline',
          handler: () => { void this.shareShoppingListAsText(); },
        },
        { role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async shareShoppingListAsText(): Promise<void> {
    const state = this.shoppingAnalysis();
    const manuals = this.manualItemsStore.manualItems();
    if (!state.summary.total && !manuals.length) return;

    const text = this.buildShoppingListText(state.groupedSuggestions, manuals);
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text });
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_LIST_SHARED, {
        item_count: state.summary.total + manuals.length,
        format: 'text',
      });
    } catch {
      // user cancelled or share unavailable — silent
    }
  }

  private buildShoppingListText(
    groups: ShoppingSuggestionGroupWithItem[],
    manualItems: ManualItem[],
  ): string {
    const locale = this.languageService.getCurrentLocale();
    const title = this.translate.instant('shopping.share.pdfTitle');
    const date = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    const footer = this.translate.instant('shopping.share.generatedWith');
    const manualSection = this.translate.instant('shopping.share.manualSection');

    const lines: string[] = [`🛒 ${title} · ${date}`, ''];

    for (const group of groups) {
      if (!group.suggestions.length) continue;
      lines.push(group.label);
      for (const s of group.suggestions) {
        const isFresh = s.reason === ShoppingReason.FRESH_EMPTY || s.reason === ShoppingReason.FRESH_LOW;
        const name = s.item?.name ?? '';
        lines.push(isFresh ? `• ${name}` : `• ${name} x${s.suggestedQuantity}`);
      }
      lines.push('');
    }

    if (manualItems.length) {
      lines.push(manualSection);
      for (const item of manualItems) lines.push(`• ${item.name}`);
      lines.push('');
    }

    lines.push(`— ${footer}`);
    return lines.join('\n');
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
        const pdfBlob = await this.buildShoppingPdf(state.groupedSuggestions, this.manualItemsStore.manualItems());
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

  private async buildShoppingPdf(
    groups: ShoppingSuggestionGroupWithItem[],
    manualItems: ManualItem[],
  ): Promise<Blob> {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const now = new Date();
    const locale = this.languageService.getCurrentLocale();

    // ── Colour palette ────────────────────────────────────────────────────────
    const TEAL: [number, number, number]        = [58, 152, 130];
    const DARK: [number, number, number]        = [30, 30, 30];
    const MUTED: [number, number, number]       = [110, 110, 110];
    const CHECKBOX_CLR: [number, number, number]= [160, 160, 160];
    const WHITE: [number, number, number]       = [255, 255, 255];

    // ── Layout constants ──────────────────────────────────────────────────────
    const PAGE_W      = doc.internal.pageSize.getWidth();
    const PAGE_H      = doc.internal.pageSize.getHeight();
    const MARGIN_X    = 14;
    const HEADER_H    = 26;
    const LINE_H      = 5.5;
    const CHECKBOX_SZ = 3.5;
    const TEXT_X      = MARGIN_X + 6;
    const QTY_X       = PAGE_W - MARGIN_X;
    const BOTTOM_ZONE = 20;   // reserved for footer

    // ── Helpers ───────────────────────────────────────────────────────────────
    const guardSpace = (y: number, needed: number): number => {
      if (y + needed > PAGE_H - BOTTOM_ZONE) {
        doc.addPage();
        this.drawPdfHeader(doc, PAGE_W, HEADER_H, TEAL, WHITE, '');
        return HEADER_H + 8;
      }
      return y;
    };

    const drawSection = (label: string, y: number): number => {
      y = guardSpace(y, LINE_H * 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEAL);
      doc.text(label.toUpperCase(), MARGIN_X, y);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, y + 1.5, PAGE_W - MARGIN_X, y + 1.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      return y + LINE_H;
    };

    const drawRow = (name: string, qty: string, y: number): number => {
      const maxW = QTY_X - TEXT_X - (qty ? 18 : 4);
      const lines = doc.splitTextToSize(name, maxW) as string[];
      const needed = lines.length * LINE_H + 2;
      y = guardSpace(y, needed);

      doc.setDrawColor(...CHECKBOX_CLR);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN_X, y - CHECKBOX_SZ + 0.5, CHECKBOX_SZ, CHECKBOX_SZ);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      lines.forEach((line, i) => doc.text(line, TEXT_X, y + i * LINE_H));

      if (qty) {
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(qty, QTY_X, y, { align: 'right' });
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
      }

      return y + needed;
    };

    // ── Page 1 header ─────────────────────────────────────────────────────────
    const title    = this.translate.instant('shopping.share.pdfTitle');
    const dateStr  = now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const iconUrl  = await this.loadIconDataUrl();
    this.drawPdfHeader(doc, PAGE_W, HEADER_H, TEAL, WHITE, iconUrl, title, dateStr);

    // ── Content ───────────────────────────────────────────────────────────────
    let y = HEADER_H + 8;

    for (const group of groups) {
      if (!group.suggestions.length) continue;
      y = drawSection(group.label, y);
      for (const s of group.suggestions) {
        const isFresh = s.reason === ShoppingReason.FRESH_EMPTY || s.reason === ShoppingReason.FRESH_LOW;
        y = drawRow(s.item?.name ?? '', isFresh ? '' : formatQuantity(s.suggestedQuantity, locale), y);
      }
      y += 4;
    }

    if (manualItems.length) {
      const sectionLabel = this.translate.instant('shopping.share.manualSection');
      y = drawSection(sectionLabel, y);
      for (const item of manualItems) {
        y = drawRow(item.name, '', y);
      }
    }

    // ── Footers (all pages) ───────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total        = (doc.internal as any).getNumberOfPages() as number;
    const footerLineY  = PAGE_H - 12;
    const footerTextY  = PAGE_H - 7;
    const footerLabel  = this.translate.instant('shopping.share.generatedWith');

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, footerLineY, PAGE_W - MARGIN_X, footerLineY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(footerLabel, MARGIN_X, footerTextY);
      doc.text(`${p} / ${total}`, PAGE_W - MARGIN_X, footerTextY, { align: 'right' });
    }

    return doc.output('blob') as Blob;
  }

  private drawPdfHeader(
    doc: jsPDF,
    pageW: number,
    headerH: number,
    teal: [number, number, number],
    white: [number, number, number],
    iconUrl: string | null,
    title?: string,
    dateStr?: string,
  ): void {
    doc.setFillColor(...teal);
    doc.rect(0, 0, pageW, headerH, 'F');
    if (iconUrl) {
      doc.addImage(iconUrl, 'PNG', 4, 4, 18, 18);
    }
    if (title) {
      doc.setTextColor(...white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PantryMind', iconUrl ? 26 : 14, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`${title} · ${dateStr ?? ''}`, iconUrl ? 26 : 14, 20);
      doc.setTextColor(0, 0, 0);
    }
  }

  private async loadIconDataUrl(): Promise<string | null> {
    try {
      const resp = await fetch('/assets/icon/app-icon.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

}
