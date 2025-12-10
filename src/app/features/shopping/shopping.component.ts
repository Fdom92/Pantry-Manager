import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  MeasurementUnit,
  PantryItem,
  ShoppingReason,
  ShoppingState,
  ShoppingSuggestion,
  ShoppingSuggestionGroup,
  ShoppingSummary,
} from '@core/models';
import { LanguageService, PantryService } from '@core/services';
import { PantryStoreService } from '@core/store/pantry-store.service';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonChip,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AddPurchaseModalComponent } from './add-purchase-modal/add-purchase-modal.component';
import { EmptyStateGenericComponent } from '../shared/empty-states/empty-state-generic.component';

type ShoppingSuggestionWithItem = ShoppingSuggestion<PantryItem>;
type ShoppingSuggestionGroupWithItem = ShoppingSuggestionGroup<PantryItem>;
type ShoppingStateWithItem = ShoppingState<PantryItem>;

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
    IonChip,
    IonSpinner,
    CommonModule,
    TranslateModule,
    EmptyStateGenericComponent,
  ],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
})
export class ShoppingComponent {
  private readonly unassignedSupermarketKey = '__none__';

  readonly loading = this.pantryStore.loading;
  readonly shoppingState = computed<ShoppingStateWithItem>(() => {
    const analysis = this.analyzeShopping(this.pantryStore.items());
    return {
      ...analysis,
      hasAlerts: analysis.summary.total > 0,
    };
  });
  readonly summaryExpanded = signal(true);
  readonly processingIds = signal<Set<string>>(new Set());

  constructor(
    private readonly pantryStore: PantryStoreService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService,
    private readonly modalCtrl: ModalController,
    private readonly pantryService: PantryService,
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
        return 'danger';
      case 'basic-low':
        return 'tertiary';
      default:
        return 'warning';
    }
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

  getUnitLabel(unit: MeasurementUnit | string): string {
    return this.pantryStore.getUnitLabel(this.normalizeUnit(unit));
  }

  getLocationLabel(locationId: string): string {
    return this.formatLocationLabel(locationId, this.translate.instant('common.locations.none'));
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

  getSuggestionTrackId(suggestion: ShoppingSuggestionWithItem): string {
    return suggestion.item?._id ?? suggestion.item?.name ?? 'item';
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
}
