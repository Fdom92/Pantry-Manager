import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  MeasurementUnit,
  PantryItem,
  ShoppingReason,
  ShoppingStateWithItem,
  ShoppingSuggestionGroupWithItem,
  ShoppingSuggestionWithItem,
  ShoppingSummary
} from '@core/models';
import { LanguageService, PantryService } from '@core/services';
import { PantryStoreService } from '@core/store/pantry-store.service';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';
import jsPDF from 'jspdf';
import { AddPurchaseModalComponent } from './add-purchase-modal/add-purchase-modal.component';

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    TranslateModule,
    EmptyStateGenericComponent,
  ],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
})
export class ShoppingComponent {
  // Data
  readonly loading = this.pantryStore.loading;
  private readonly unassignedSupermarketKey = '__none__';
  // Signals
  readonly summaryExpanded = signal(true);
  readonly processingIds = signal<Set<string>>(new Set());
  readonly sharingList = signal(false);
  // Computed Signals
  readonly shoppingState = computed<ShoppingStateWithItem>(() => {
    const analysis = this.analyzeShopping(this.pantryStore.items());
    return {
      ...analysis,
      hasAlerts: analysis.summary.total > 0,
    };
  });

  constructor(
    private readonly pantryStore: PantryStoreService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService,
    private readonly modalCtrl: ModalController,
    private readonly pantryService: PantryService,
    private readonly toastCtrl: ToastController,
  ) {}

  /** Lifecycle hook: make sure the store is populated before rendering suggestions. */
  async ionViewWillEnter(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  toggleSummary(): void {
    this.summaryExpanded.update(isOpen => !isOpen);
  }

  isProcessing(id: string | undefined): boolean {
    return id ? this.processingIds().has(id) : false;
  }

  /**
   * Open modal to confirm purchase details and apply them.
   */
  async openPurchaseModal(suggestion: ShoppingSuggestionWithItem): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddPurchaseModalComponent,
      componentProps: {
        item: {
          id: suggestion.item?._id,
          productId: suggestion.item?._id,
          suggestedQuantity: suggestion.suggestedQuantity,
          locationId: suggestion.locationId,
        },
        product: suggestion.item,
      },
    });
    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (!data) return;

    await this.handlePurchase(suggestion, data);
  }

  getBadgeColor(reason: ShoppingReason): string {
    switch (reason) {
      case 'basic-out':
      case 'empty':
        return 'danger';
      case 'basic-low':
      case 'below-min':
        return 'warning';
      default:
        return 'primary';
    }
  }

  getUnitLabel(unit: MeasurementUnit | string): string {
    return this.pantryStore.getUnitLabel(this.normalizeUnit(unit));
  }

  getLocationLabel(locationId: string): string {
    return this.formatLocationLabel(locationId, this.translate.instant('common.locations.none'));
  }

  async shareShoppingList(): Promise<void> {
    if (this.sharingList()) {
      return;
    }

    const state = this.shoppingState();
    if (!state.summary.total) {
      await this.presentToast(this.translate.instant('shopping.share.empty'), 'medium');
      return;
    }

    this.sharingList.set(true);
    try {
      const pdfBlob = this.buildShoppingPdf(state.groupedSuggestions);
      const filename = this.buildShareFileName();
      const shared =
        (await this.tryNativeShare(pdfBlob, filename)) || (await this.tryWebShare(pdfBlob, filename));

      if (shared) {
        await this.presentToast(this.translate.instant('shopping.share.ready'), 'success');
      } else {
        this.triggerDownload(pdfBlob, filename);
        await this.presentToast(this.translate.instant('shopping.share.saved'), 'success');
      }
    } catch (err) {
      console.error('[ShoppingComponent] shareShoppingList error', err);
      await this.presentToast(this.translate.instant('shopping.share.error'), 'danger');
    } finally {
      this.sharingList.set(false);
    }
  }

  getSuggestionTrackId(suggestion: ShoppingSuggestionWithItem): string {
    return suggestion.item?._id ?? suggestion.item?.name ?? 'item';
  }

  /**
   * Evaluate every location for each item and produce actionable shopping suggestions.
   * Returns both the detailed list and aggregate counters for the summary card.
   */
  private analyzeShopping(items: PantryItem[]): Omit<ShoppingStateWithItem, 'hasAlerts'> {
    const suggestions: ShoppingSuggestionWithItem[] = [];
    const uniqueSupermarkets = new Set<string>();
    const summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      basicLow: 0,
      basicOut: 0,
      supermarketCount: 0,
    };

    for (const item of items) {
      const isBasic = Boolean(item.isBasic);
      const minThreshold = item.minThreshold != null ? Number(item.minThreshold) : null;
      const totalQuantity = this.pantryStore.getItemTotalQuantity(item);
      const primaryLocation = item.locations[0];
      const locationId = primaryLocation?.locationId ?? 'unassigned';
      const unit = this.normalizeUnit(primaryLocation?.unit ?? this.pantryStore.getItemPrimaryUnit(item));

      let reason: ShoppingReason | null = null;
      let suggestedQuantity = 0;

      if (isBasic && totalQuantity <= 0) {
        reason = 'basic-out';
        suggestedQuantity = this.ensurePositiveQuantity(minThreshold ?? 1);
      } else if (isBasic && minThreshold != null && totalQuantity < minThreshold) {
        reason = 'basic-low';
        suggestedQuantity = this.ensurePositiveQuantity(minThreshold - totalQuantity, minThreshold);
      } else if (minThreshold != null && totalQuantity < minThreshold) {
        reason = 'below-min';
        suggestedQuantity = this.ensurePositiveQuantity(minThreshold - totalQuantity, minThreshold);
      } else if (minThreshold === null && totalQuantity <= 0) {
        reason = 'empty';
        suggestedQuantity = this.ensurePositiveQuantity(1);
      }

      if (reason) {
        const supermarket = this.normalizeSupermarketValue(item.supermarket);
        if (supermarket) {
          uniqueSupermarkets.add(supermarket.toLowerCase());
        }

        suggestions.push({
          item,
          locationId,
          reason,
          suggestedQuantity,
          currentQuantity: this.roundQuantity(totalQuantity),
          minThreshold: minThreshold != null ? this.roundQuantity(minThreshold) : undefined,
          unit,
          supermarket,
        });

        switch (reason) {
          case 'below-min':
            summary.belowMin += 1;
            break;
          case 'basic-low':
            summary.basicLow += 1;
            break;
          case 'basic-out':
            summary.basicOut += 1;
            break;
        }
      }
    }

    summary.total = suggestions.length;
    summary.supermarketCount = uniqueSupermarkets.size;
    const groupedSuggestions = this.groupSuggestionsBySupermarket(suggestions);
    return { suggestions, groupedSuggestions, summary };
  }

  private normalizeSupermarketValue(value?: string | null): string | undefined {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.replace(/\s+/g, ' ');
  }

  private groupSuggestionsBySupermarket(
    suggestions: ShoppingSuggestionWithItem[]
  ): ShoppingSuggestionGroupWithItem[] {
    const map = new Map<string, ShoppingSuggestionWithItem[]>();
    for (const suggestion of suggestions) {
      const key = suggestion.supermarket?.toLowerCase() ?? this.unassignedSupermarketKey;
      const list = map.get(key);
      if (list) {
        list.push(suggestion);
      } else {
        map.set(key, [suggestion]);
      }
    }

    const groups = Array.from(map.entries()).map(([key, list]) => {
      const label =
        key === this.unassignedSupermarketKey
          ? this.getUnassignedSupermarketLabel()
          : list[0]?.supermarket ?? this.getUnassignedSupermarketLabel();
      return {
        key,
        label,
        suggestions: list,
      };
    });

    return groups.sort((a, b) => {
      if (a.key === this.unassignedSupermarketKey) {
        return 1;
      }
      if (b.key === this.unassignedSupermarketKey) {
        return -1;
      }
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Persist the purchased batch and refresh shopping state.
   */
  private async handlePurchase(
    suggestion: ShoppingSuggestionWithItem,
    data: { quantity: number; expiryDate?: string | null; location: string }
  ): Promise<void> {
    const id = suggestion.item?._id;
    if (!id || this.isProcessing(id)) {
      return;
    }

    this.processingIds.update(ids => {
      const next = new Set(ids);
      next.add(id);
      return next;
    });

    try {
      await this.pantryService.addNewLot(id, {
        quantity: data.quantity,
        expiryDate: data.expiryDate ?? undefined,
        location: data.location,
      });
      await this.pantryStore.loadAll();
    } finally {
      this.processingIds.update(ids => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  /** Keep the suggested quantity positive, defaulting to a fallback when needed. */
  private ensurePositiveQuantity(value: number, fallback?: number): number {
    const rounded = this.roundQuantity(value);
    if (rounded > 0) {
      return rounded;
    }

    if (fallback != null && fallback > 0) {
      return this.roundQuantity(fallback);
    }

    return 1;
  }

  /** Round quantities to two decimals to keep UI values tidy. */
  private roundQuantity(value: number): number {
    const num = Number(value ?? 0);
    if (!isFinite(num)) {
      return 0;
    }
    return Math.round(num * 100) / 100;
  }

  private normalizeUnit(unit?: MeasurementUnit | string | null): string {
    if (typeof unit !== 'string') {
      return MeasurementUnit.UNIT;
    }
    const trimmed = unit.trim();
    if (!trimmed) {
      return MeasurementUnit.UNIT;
    }
    return trimmed;
  }

  private getUnassignedSupermarketLabel(): string {
    return this.translate.instant('shopping.unassignedSupermarket');
  }

  private formatLocationLabel(value: string | null | undefined, fallback: string = ''): string {
    const trimmed = (value ?? '').trim();
    return trimmed || fallback || 'No location';
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
    const headers = {
      product: this.translate.instant('shopping.share.headers.product'),
      quantity: this.translate.instant('shopping.share.headers.quantity'),
      supermarket: this.translate.instant('shopping.share.headers.supermarket'),
    };

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
    return new Intl.DateTimeFormat(this.languageService.getCurrentLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(this.roundQuantity(value));
    const unitLabel = this.getUnitLabel(unit);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  }

  private buildShareFileName(): string {
    return `shopping-list-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async tryWebShare(blob: Blob, filename: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false;
    }

    const file = new File([blob], filename, { type: 'application/pdf' });
    const canShareFiles =
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] }) &&
      typeof navigator.share === 'function';

    if (!canShareFiles) {
      return false;
    }

    try {
      await navigator.share({
        title: this.translate.instant('shopping.share.dialogTitle'),
        text: this.translate.instant('shopping.share.dialogText'),
        files: [file],
      });
      return true;
    } catch (err) {
      console.warn('[ShoppingComponent] Web share failed or was cancelled', err);
      return false;
    }
  }

  private async tryNativeShare(blob: Blob, filename: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const base64Data = await this.blobToBase64(blob);
      const path = `PantryManager/${filename}`;
      await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
      await Share.share({
        title: this.translate.instant('shopping.share.dialogTitle'),
        text: this.translate.instant('shopping.share.dialogText'),
        url: uri,
      });
      return true;
    } catch (err) {
      console.warn('[ShoppingComponent] Native share unavailable', err);
      return false;
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    return this.arrayBufferToBase64(buffer);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'medium'
  ): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }
}
