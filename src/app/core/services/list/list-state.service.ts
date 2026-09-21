import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import { SHOPPING_LIST_NAME } from '@core/constants';
import { buildShoppingAnalysis, listRowActions, type ListRowAction, type ListRowKind } from '@core/domain/list';
import { classifyNativeDismissal } from '@core/domain/shared';
import { formatIsoTimestampForFilename } from '@core/domain/settings';
import type { PantryItem } from '@core/models/pantry';
import { type ShoppingStateWithItem, type ShoppingSuggestionWithItem, ShoppingReason } from '@core/models/list';
import { restockFreshItem } from '@core/domain/pantry/fresh.domain';
import { generateBatchId } from '@core/utils/batch-id.util';
import { createDocumentId, createLatestOnlyRunner, SkeletonLoadingManager, withSignalFlag } from '@core/utils';
import { buildAddItemPayload } from '@core/domain/pantry/pantry-builder.domain';
import { resolveSuggestedExpiry, toLotExpiry } from '@core/domain/pantry/food-type-inference.domain';
import { setBasic, sumQuantities } from '@core/domain/pantry';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { DownloadService, LoggerService, ShareService, ToastService, shouldSkipShareOutcome } from '../shared';
import { normalizeProductKey } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { ListManualItemsStore } from './list-manual-items.store';
import { ShoppingExportService } from './shopping-export.service';

@Injectable()
export class ListStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareTask = createLatestOnlyRunner(this.destroyRef);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly translate = inject(TranslateService);
  private readonly download = inject(DownloadService);
  private readonly share = inject(ShareService);
  private readonly toast = inject(ToastService);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly analytics = inject(AnalyticsService);
  private readonly manualItemsStore = inject(ListManualItemsStore);
  private readonly exportService = inject(ShoppingExportService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly logger = inject(LoggerService);

  readonly isSharingListInProgress = signal(false);

  // Ephemeral per-visit state — cleared on ionViewWillLeave ("hide for now" means this visit).
  readonly boughtItemIds  = signal<Set<string>>(new Set());
  readonly removedAutoIds = signal<Set<string>>(new Set());

  // Persistent across tab switches — owned by ListManualItemsStore
  readonly manualItems    = this.manualItemsStore.manualItems;
  readonly boughtManuals  = this.manualItemsStore.boughtManuals;

  readonly shoppingAnalysis = computed<ShoppingStateWithItem>(() => {
    // manualItems() is read for the dependency, not the value: the template
    // renders those rows itself, but the summary has to recompute when they move.
    void this.manualItems();
    return buildShoppingAnalysis({
      items: this.items(),
      boughtIds: this.boughtItemIds(),
      removedIds: this.removedAutoIds(),
      boughtManuals: this.boughtManuals(),
      unassignedLabel: this.translate.instant('shopping.unassignedSupermarket'),
    });
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
        const updatedFresh = restockFreshItem(item, timestamp, generateBatchId());
        await this.pantryStore.updateItem(updatedFresh);
        await this.eventManager.logAdvancedEdit(item, updatedFresh, 'pantry_card');
      } else {
        const quantity = opts?.quantityOverride && opts.quantityOverride > 0
          ? opts.quantityOverride
          : suggestion.suggestedQuantity;
        const previous = suggestion.item;
        // Restocking an existing product: derive the expiry from the product's
        // own foodType when it has one, otherwise infer it from its name. Without
        // this the new lot is dateless and invisible to every expiry alert.
        const suggested = resolveSuggestedExpiry(previous.name, previous.foodType);
        const updated = await this.pantryStore.addNewLot(id, { quantity, ...toLotExpiry(suggested) });
        if (updated) {
          await this.eventManager.logAddExistingItem(previous, updated, quantity, undefined, undefined, timestamp);
        }
      }
      this.toast.success('shopping.toasts.bought', { name });
      void this.reviewPrompt.handlePositiveAction();
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BUY_COMPLETED, {
        kind: isFresh ? 'fresh' : 'despensa',
        reason: suggestion.reason,
        quantity_override: Boolean(opts?.quantityOverride && opts.quantityOverride > 0),
      });
    } catch (err) {
      this.logger.error('ListStateService', 'markAsBought failed', err);
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
    const target = normalizeProductKey(item.name);
    const match = this.items().find(p => normalizeProductKey(p.name) === target);
    const timestamp = new Date().toISOString();

    try {
      if (match) {
        let updated: PantryItem | null;
        if (match.productType === 'fresh') {
          // Fresh products track stock as a state on a single batch, so they are
          // refilled rather than given a new lot.
          updated = restockFreshItem(match, timestamp, generateBatchId());
          await this.pantryStore.updateItem(updated);
        } else {
          // Same reasoning as markAsBought: an added lot with no date would be
          // invisible to the expiry alerts.
          const suggested = resolveSuggestedExpiry(match.name, match.foodType);
          updated = await this.pantryStore.addNewLot(match._id, { quantity, ...toLotExpiry(suggested) });
          if (updated) await this.pantryStore.updateItem(updated);
        }
        if (updated) {
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
      this.logger.error('ListStateService', 'markManualAsBought add-to-pantry failed', err);
    }

    this.toast.success('shopping.toasts.boughtManual', { name: item.name });
  }

  removeAutoItem(id: string): void {
    const name = this.items().find(i => i._id === id)?.name;
    this.removedAutoIds.update(set => new Set([...set, id]));
    if (name) {
      this.toast.info('shopping.toasts.ignored', { name });
    }
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ITEM_REMOVED, { source: 'auto', surface: 'menu' });
  }

  removeManualItem(id: string): void {
    const item = this.manualItemsStore.removeManual(id);
    if (item) {
      this.toast.success('shopping.toasts.removedManual', { name: item.name });
    }
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ITEM_REMOVED, { source: 'manual', surface: 'menu' });
  }

  private static readonly ROW_ACTION_LABELS: Record<ListRowAction, string> = {
    hide: 'shopping.rowMenu.hide',
    unbasic: 'shopping.rowMenu.unbasic',
    remove: 'shopping.rowMenu.remove',
    unhide: 'shopping.rowMenu.unhide',
  };

  private static readonly ROW_ACTION_ICONS: Record<ListRowAction, string> = {
    hide: 'eye-off-outline',
    unbasic: 'star-outline',
    remove: 'trash-outline',
    unhide: 'eye-outline',
  };

  async openRowActions(row: { kind: ListRowKind; id: string; name: string }): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ROW_MENU_OPENED, { kind: row.kind });
    const sheet = await this.actionSheetCtrl.create({
      header: row.name,
      buttons: [
        ...listRowActions(row.kind).map(spec => ({
          text: this.translate.instant(ListStateService.ROW_ACTION_LABELS[spec.action]),
          icon: ListStateService.ROW_ACTION_ICONS[spec.action],
          role: spec.destructive ? 'destructive' : undefined,
          handler: () => { void this.runRowAction(spec.action, row); },
        })),
        { role: 'cancel', text: this.translate.instant('common.actions.cancel') },
      ],
    });
    await sheet.present();
  }

  private async runRowAction(action: ListRowAction, row: { kind: ListRowKind; id: string }): Promise<void> {
    switch (action) {
      case 'hide': this.removeAutoItem(row.id); return;
      case 'unbasic': await this.unbasicItem(row.id, row.kind); return;
      case 'remove': this.removeManualItem(row.id); return;
      case 'unhide': this.unhideAutoItem(row.id); return;
    }
  }

  unhideAutoItem(id: string): void {
    this.removedAutoIds.update(set => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  /**
   * "Always keep at home" off, from the list. A depleted despensa product is
   * hidden from the pantry screen, so the list is the only place it can be
   * un-starred. After this it appears nowhere until added again — hence undo.
   */
  async unbasicItem(id: string, from: ListRowKind): Promise<void> {
    const item = this.items().find(i => i._id === id);
    if (!item) return;
    const previousMin = item.minThreshold;
    try {
      await this.pantryStore.updateItem(setBasic(item, false, new Date().toISOString()));
    } catch (err) {
      // pantryStore.updateItem swallows its own persistence errors — this
      // catches anything else (e.g. setBasic itself throwing).
      this.logger.error('ListStateService', 'unbasicItem failed', err);
      return;
    }
    this.unhideAutoItem(id);
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BASIC_REMOVED, {
      product_type: item.productType === 'fresh' ? 'fresh' : 'despensa',
      from,
      depleted: sumQuantities(item.batches ?? []) <= 0,
    });
    this.toast.withAction(
      'shopping.toasts.unbasic',
      'common.actions.undo',
      () => { void this.restoreBasic(id, previousMin); },
      { name: item.name },
    );
  }

  private async restoreBasic(id: string, previousMin: number | undefined): Promise<void> {
    const current = this.items().find(i => i._id === id);
    if (!current) return;
    try {
      await this.pantryStore.updateItem(setBasic(current, true, new Date().toISOString(), previousMin));
    } catch (err) {
      this.logger.error('ListStateService', 'restoreBasic failed', err);
      return;
    }
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BASIC_RESTORED);
  }

  addManualItem(name: string, source: 'user' | 'preset' = 'user'): void {
    this.manualItemsStore.addManualItem(name, source);
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
        { role: 'cancel', text: this.translate.instant('common.actions.cancel') },
      ],
    });
    await sheet.present();
  }

  async shareShoppingListAsText(): Promise<void> {
    const state = this.shoppingAnalysis();
    const manuals = this.manualItemsStore.manualItems();
    if (!state.summary.total && !manuals.length) return;

    const text = this.exportService.buildText(state.groupedSuggestions, manuals);
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text });
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_LIST_SHARED, {
        item_count: state.summary.total + manuals.length,
        format: 'text',
      });
    } catch (err) {
      // QA found this one by picking "Text" from the share sheet and watching
      // nothing happen at all: cancelling and a broken Share plugin took the
      // same silent path. Only a recognised cancellation stays quiet now.
      if (classifyNativeDismissal(err) === 'cancelled') {
        return;
      }
      this.logger.error('ListStateService', 'shareShoppingListAsText failed', err);
      this.toast.error('shopping.toasts.shareFailed');
    }
  }


  async shareShoppingListReport(): Promise<void> {
    await this.shareTask.run(async isActive => {
      if (this.isSharingListInProgress()) {
        return;
      }

      const state = this.shoppingAnalysis();
      if (!state.summary.total && !this.manualItemsStore.manualItems().length) {
        return;
      }
      this.analytics.track(ANALYTICS_EVENTS.SHOPPING_LIST_SHARED, {
        item_count: state.summary.total,
      });

      await withSignalFlag(this.isSharingListInProgress, async () => {
        const pdfBlob = await this.exportService.buildPdf(state.groupedSuggestions, this.manualItemsStore.manualItems());
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

        // Native share unavailable or failed — surface error to user.
        this.toast.error('shopping.share.error');
      }).catch(err => {
        if (!isActive()) {
          return;
        }
        this.logger.error('ListStateService', 'shareShoppingList error', err);
        this.toast.error('shopping.share.error');
      });
    });
  }





}
