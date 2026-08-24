import { Injectable, computed, inject, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import { AlertController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { createDocumentId } from '@core/utils/uuid.util';
import { generateBatchId } from '@core/utils/batch-id.util';
import { buildAddItemPayload } from '@core/domain/pantry/pantry-builder.domain';
import { restockFreshItem } from '@core/domain/pantry/fresh.domain';
import { resolveSuggestedExpiry, toLotExpiry } from '@core/domain/pantry/food-type-inference.domain';
import { reconstructRows, parseReceipt, matchReceiptName, MATCH_AUTO_THRESHOLD } from '@core/domain/receipt';
import type { OcrLine, ParsedReceiptItem, ReceiptReviewLine } from '@core/models/receipt';
import type { PantryItem } from '@core/models/pantry';
import { PantryStoreService } from '../pantry-store.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ReceiptLlmClientService } from '../../receipt/receipt-llm-client.service';
import { UpgradeRevenuecatService } from '../../upgrade/upgrade-revenuecat.service';
import { LocalStorageService } from '../../shared/local-storage.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';

const FRAMING_HINT_KEY = 'receiptScanFraming';

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
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);
  private readonly llmClient = inject(ReceiptLlmClientService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);

  readonly isOpen = signal(false);
  readonly phase = signal<ReceiptScanPhase>('processing');
  readonly reviewLines = signal<ReceiptReviewLine[]>([]);
  readonly detectedSupermarket = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  /** True when the PRO LLM path produced the current review lines. */
  readonly usedSmartScan = signal(false);
  /** Captured once per scan — drives the free-tier upsell pill in the header. */
  readonly isPro = signal(false);

  readonly includedLines = computed(() => this.reviewLines().filter(l => l.included));
  readonly includedCount = computed(() => this.includedLines().length);

  /** Entry point: opens the camera/gallery picker, then the review sheet. */
  async startScan(): Promise<void> {
    await this.showFramingHintOnce();
    this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_STARTED, {});
    let base64: string | undefined;
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        promptLabelHeader: this.translate.instant('pantry.receiptScan.promptHeader'),
        promptLabelPhoto: this.translate.instant('pantry.receiptScan.promptGallery'),
        promptLabelPicture: this.translate.instant('pantry.receiptScan.promptCamera'),
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

      // PRO smart scan: LLM parses the OCR rows server-side (better with
      // garbled/unknown formats). Local rule-based parser is the free tier
      // and the offline/error fallback.
      let items: ParsedReceiptItem[];
      let supermarket: string | null;
      let smart = false;
      const isPro = this.revenuecat.isPro();
      this.isPro.set(isPro);
      if (isPro) {
        try {
          const smartResult = await this.llmClient.parse(rows.map(r => r.text));
          items = smartResult.items;
          supermarket = smartResult.supermarket;
          smart = true;
        } catch (err) {
          this.logger.warn('PantryReceiptScanModalStateService', 'smart scan failed, falling back to local parser', { err: String(err) });
          const parsed = parseReceipt(rows);
          items = parsed.items;
          supermarket = parsed.supermarket;
          this.showSmartScanFallbackToast();
        }
      } else {
        const parsed = parseReceipt(rows);
        items = parsed.items;
        supermarket = parsed.supermarket;
      }
      this.usedSmartScan.set(smart);
      this.detectedSupermarket.set(supermarket);

      const candidates = this.pantryStore.loadedProducts().map(item => ({ id: item._id, name: item.name }));
      const itemsById = new Map(this.pantryStore.loadedProducts().map(item => [item._id, item]));

      const lines: ReceiptReviewLine[] = items.map((item, index) => {
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
      this.logger.error('PantryReceiptScanModalStateService', 'OCR/parse error', err);
      this.phase.set('error');
      this.analytics.track(ANALYTICS_EVENTS.RECEIPT_SCAN_FAILED, { reason: 'ocr_error' });
    }
  }

  /**
   * PRO tried the LLM path and it failed (network/backend error) — the scan
   * still succeeds via the local parser, but a paying user should know this
   * particular scan didn't get the smart-scan treatment, not just silently
   * see the smart badge missing.
   */
  private showSmartScanFallbackToast(): void {
    this.toast.info('pantry.receiptScan.smartScanFallback');
  }

  /**
   * One-shot tip before the first scan: framing only the product list (no
   * header, no totals) measurably improves OCR quality. The system camera
   * can't render overlays, so the tip goes before it opens.
   */
  private async showFramingHintOnce(): Promise<void> {
    if (this.localStorage.coachMark.isShown(FRAMING_HINT_KEY)) return;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('pantry.receiptScan.hintTitle'),
      message: this.translate.instant('pantry.receiptScan.hintMessage'),
      buttons: [{ text: this.translate.instant('pantry.receiptScan.hintOk'), role: 'confirm' }],
    });
    await alert.present();
    // Mark as seen on present (not on dismiss): if the dialog ever fails to
    // close cleanly, the hint must never block future scans.
    this.localStorage.coachMark.markShown(FRAMING_HINT_KEY);
    await alert.onDidDismiss();
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

  /** Tap on a line name → alert prompt to correct OCR-garbled text. */
  async editLineName(id: number): Promise<void> {
    const line = this.reviewLines().find(l => l.id === id);
    if (!line) return;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('pantry.receiptScan.editNameTitle'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.displayName(line),
        },
      ],
      buttons: [
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('common.actions.save'),
          handler: (data: { name?: string }) => {
            const name = (data.name ?? '').trim();
            if (!name) return;
            // Re-match against the pantry: typing the right name should link
            // the line to the existing product instead of creating a copy.
            const candidates = this.pantryStore.loadedProducts().map(item => ({ id: item._id, name: item.name }));
            const rematch = matchReceiptName(name, candidates);
            const matchedItem = rematch
              ? this.pantryStore.loadedProducts().find(i => i._id === rematch.id) ?? null
              : null;
            this.reviewLines.update(lines =>
              lines.map(l =>
                l.id === id
                  ? {
                      ...l,
                      parsed: { ...l.parsed, rawName: name },
                      match: matchedItem,
                      matchScore: rematch?.score ?? 0,
                    }
                  : l,
              ),
            );
            this.analytics.track(ANALYTICS_EVENTS.RECEIPT_LINE_EDITED, { field: 'name' });
          },
        },
      ],
    });
    await alert.present();
  }

  /** True when the match is strong enough to add to the existing item. */
  isAutoMatch(line: ReceiptReviewLine): boolean {
    return !!line.match && line.matchScore >= MATCH_AUTO_THRESHOLD;
  }

  /** True when the auto-matched item is a fresh product (restocked, not lotted). */
  isFreshMatch(line: ReceiptReviewLine): boolean {
    return this.isAutoMatch(line) && line.match!.productType === 'fresh';
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
          const matchedItem = line.match!;
          // Fresh items are single-batch and state-based (sufficient/low/none),
          // not FIFO lots — mirror the normal fresh-add flow (overwrite the one
          // batch to "sufficient") instead of appending a lot with the ticket's
          // literal quantity, which would pile up batches the fresh model
          // doesn't expect.
          const updated = matchedItem.productType === 'fresh'
            ? restockFreshItem(matchedItem, timestamp, generateBatchId())
            : await this.pantryStore.addNewLot(matchedItem._id, {
                quantity: line.quantity,
                ...toLotExpiry(resolveSuggestedExpiry(matchedItem.name, matchedItem.foodType)),
              });
          if (updated) {
            await this.pantryStore.updateItem(updated);
            await this.eventManager.logAddExistingItem(matchedItem, updated, line.quantity, undefined, sessionId, timestamp);
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
        mode: this.usedSmartScan() ? 'smart' : 'local',
      });

      this.close();
      this.toast.success(
        added === 1 ? 'pantry.receiptScan.toastAdded_one' : 'pantry.receiptScan.toastAdded_other',
        { count: added },
      );
    } catch (err) {
      this.logger.error('PantryReceiptScanModalStateService', 'submit error', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.reviewLines.set([]);
    this.detectedSupermarket.set(null);
    this.usedSmartScan.set(false);
    this.isPro.set(false);
  }
}

/**
 * Fresh items are single-batch: restocking overwrites that one batch to
 * "sufficient" rather than appending a lot, mirroring
 * PantryFreshAddModalStateService's existing-item path. The ticket's scanned
 * quantity is ignored here — fresh state isn't a literal count.
 */
/** Receipt names come in SHOUTING CASE — store them as Title Case. */
function formatReceiptName(raw: string): string {
  return raw
    .toLowerCase()
    .split(' ')
    .map(word => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
    .replace(/^./, c => c.toUpperCase());
}
