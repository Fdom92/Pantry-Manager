import { Injectable, computed, inject, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { createDocumentId } from '@core/utils/uuid.util';
import { buildAddItemPayload } from '@core/domain/pantry/pantry-builder.domain';
import { reconstructRows, parseReceipt, matchReceiptName, MATCH_AUTO_THRESHOLD } from '@core/domain/receipt';
import type { OcrLine, ReceiptReviewLine } from '@core/models/receipt';
import type { PantryItem } from '@core/models/pantry';
import { PantryStoreService } from '../pantry-store.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';

export type ReceiptScanPhase = 'processing' | 'review' | 'error';

/**
 * Receipt scan flow (feat 5.1): photo → on-device OCR → parse → fuzzy match
 * against existing pantry items → review screen → bulk add.
 */
@Injectable()
export class PantryReceiptScanModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly analytics = inject(AnalyticsService);
  private readonly translate = inject(TranslateService);
  private readonly toastCtrl = inject(ToastController);

  readonly isOpen = signal(false);
  readonly phase = signal<ReceiptScanPhase>('processing');
  readonly reviewLines = signal<ReceiptReviewLine[]>([]);
  readonly detectedSupermarket = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly includedLines = computed(() => this.reviewLines().filter(l => l.included));
  readonly includedCount = computed(() => this.includedLines().length);

  /** Entry point: opens the camera/gallery picker, then the review sheet. */
  async startScan(): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_STARTED, {});
    let base64: string | undefined;
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });
      base64 = photo.base64String;
    } catch {
      // Picker cancelled — nothing to do.
      return;
    }
    if (!base64) return;

    this.isOpen.set(true);
    this.phase.set('processing');
    this.reviewLines.set([]);

    try {
      const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: base64 });
      const ocrLines: OcrLine[] = result.blocks.flatMap(block =>
        block.lines.map(line => ({ text: line.text, box: line.boundingBox ?? null })),
      );
      const rows = reconstructRows(ocrLines);
      const parsed = parseReceipt(rows);
      this.detectedSupermarket.set(parsed.supermarket);

      const candidates = this.pantryStore.loadedProducts().map(item => ({ id: item._id, name: item.name }));
      const itemsById = new Map(this.pantryStore.loadedProducts().map(item => [item._id, item]));

      const lines: ReceiptReviewLine[] = parsed.items.map((item, index) => {
        const match = matchReceiptName(item.rawName, candidates);
        const matchedItem = match ? itemsById.get(match.id) ?? null : null;
        return {
          id: index,
          parsed: item,
          match: matchedItem,
          matchScore: match?.score ?? 0,
          included: item.confidence !== 'low',
          quantity: item.quantity,
        };
      });

      this.reviewLines.set(lines);
      this.phase.set('review');
      if (!lines.length) {
        this.phase.set('error');
        this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_FAILED, { reason: 'no_products' });
      }
    } catch (err) {
      console.error('[PantryReceiptScanModalStateService] OCR/parse error', err);
      this.phase.set('error');
      this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_FAILED, { reason: 'ocr_error' });
    }
  }

  toggleLine(id: number): void {
    this.reviewLines.update(lines =>
      lines.map(l => (l.id === id ? { ...l, included: !l.included } : l)),
    );
  }

  adjustLineQuantity(id: number, delta: number): void {
    this.reviewLines.update(lines =>
      lines.map(l =>
        l.id === id ? { ...l, quantity: Math.min(99, Math.max(1, l.quantity + delta)) } : l,
      ),
    );
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_LINE_EDITED, { field: 'quantity' });
  }

  /** True when the match is strong enough to add to the existing item. */
  isAutoMatch(line: ReceiptReviewLine): boolean {
    return !!line.match && line.matchScore >= MATCH_AUTO_THRESHOLD;
  }

  displayName(line: ReceiptReviewLine): string {
    return this.isAutoMatch(line) ? line.match!.name : formatReceiptName(line.parsed.rawName);
  }

  async submit(): Promise<void> {
    if (this.isSubmitting()) return;
    const lines = this.includedLines();
    if (!lines.length) return;
    this.isSubmitting.set(true);

    const sessionId = createDocumentId('session');
    const timestamp = new Date().toISOString();
    let added = 0;
    let matched = 0;

    try {
      for (const line of lines) {
        if (this.isAutoMatch(line)) {
          const updated = await this.pantryStore.addNewLot(line.match!._id, {
            quantity: line.quantity,
          });
          if (updated) {
            await this.pantryStore.updateItem(updated);
            await this.eventManager.logAddExistingItem(line.match!, updated, line.quantity, undefined, sessionId, timestamp);
            matched++;
          }
        } else {
          const base = buildAddItemPayload({
            id: createDocumentId('item'),
            nowIso: timestamp,
            name: formatReceiptName(line.parsed.rawName),
            quantity: line.quantity,
          });
          const item: PantryItem = {
            ...base,
            productType: 'pantry',
            supermarket: this.detectedSupermarket() ?? undefined,
          };
          await this.pantryStore.addItem(item);
          await this.eventManager.logAddNewItem(item, line.quantity, sessionId, timestamp);
        }
        this.analytics.track(ANALYTICS_EVENTS.PANTRY_ITEM_ADDED, {
          kind: 'despensa',
          source: 'receipt_scan',
          is_new: !this.isAutoMatch(line),
          quantity: line.quantity,
          has_expiry: false,
        });
        added++;
      }

      this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_COMPLETED, {
        items_added: added,
        items_matched: matched,
        supermarket: this.detectedSupermarket() ?? 'unknown',
      });

      this.close();
      const toast = await this.toastCtrl.create({
        message: this.translate.instant(
          added === 1 ? 'pantry.receiptScan.toastAdded_one' : 'pantry.receiptScan.toastAdded_other',
          { count: added },
        ),
        duration: 2000,
        position: 'bottom',
      });
      void toast.present();
    } catch (err) {
      console.error('[PantryReceiptScanModalStateService] submit error', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.reviewLines.set([]);
    this.detectedSupermarket.set(null);
  }
}

/** Receipt names come in SHOUTING CASE — store them as Title Case. */
function formatReceiptName(raw: string): string {
  return raw
    .toLowerCase()
    .split(' ')
    .map(word => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
    .replace(/^./, c => c.toUpperCase());
}
