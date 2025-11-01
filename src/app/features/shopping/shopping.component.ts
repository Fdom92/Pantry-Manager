import { Component, computed, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { PantryStoreService } from '@core/store/pantry-store.service';
import { SeedService } from '@core/services';
import { PantryItem, MeasurementUnit } from '@core/models';

type ShoppingReason = 'below-min' | 'basic-low' | 'basic-out';

interface ShoppingSuggestion {
  item: PantryItem;
  locationId: string;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
  unit: MeasurementUnit;
}

interface ShoppingSummary {
  total: number;
  belowMin: number;
  basicLow: number;
  basicOut: number;
}

interface ShoppingState {
  suggestions: ShoppingSuggestion[];
  summary: ShoppingSummary;
  hasAlerts: boolean;
}

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
})
export class ShoppingComponent {
  readonly reasonLabels: Record<ShoppingReason, string> = {
    'below-min': 'Below minimum',
    'basic-low': 'Basic item below minimum',
    'basic-out': 'Basic item out of stock',
  };

  readonly loading = this.pantryStore.loading;
  readonly shoppingState = computed<ShoppingState>(() => {
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
    private readonly seedService: SeedService,
  ) {}

  /** Lifecycle hook: make sure the store is populated before rendering suggestions. */
  async ionViewWillEnter(): Promise<void> {
    // await this.seedService.ensureSeedData();
    await this.pantryStore.loadAll();
  }

  toggleSummary(): void {
    this.summaryExpanded.update(isOpen => !isOpen);
  }

  isProcessing(id: string | undefined): boolean {
    return id ? this.processingIds().has(id) : false;
  }

  /**
   * Apply the suggested purchase quantity to the relevant item/location,
   * guarding against concurrent operations on the same item.
   */
  async markAsPurchased(suggestion: ShoppingSuggestion): Promise<void> {
    const id = suggestion.item?._id;
    if (!id || this.isProcessing(id) || suggestion.suggestedQuantity <= 0) {
      return;
    }

    this.processingIds.update(ids => {
      const next = new Set(ids);
      next.add(id);
      return next;
    });

    try {
      await this.pantryStore.adjustQuantity(id, suggestion.locationId, suggestion.suggestedQuantity);
    } finally {
      this.processingIds.update(ids => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
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

  getUnitLabel(unit: MeasurementUnit): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getLocationLabel(locationId: string): string {
    const key = (locationId ?? '').trim().toLowerCase();
    if (!key) {
      return 'Unassigned';
    }
    switch (key) {
      case 'pantry':
        return 'Pantry';
      case 'kitchen':
        return 'Kitchen';
      case 'fridge':
        return 'Fridge';
      case 'freezer':
        return 'Freezer';
      case 'bathroom':
        return 'Bathroom';
      default:
        return this.toTitleCase(locationId);
    }
  }

  /**
   * Evaluate every location for each item and produce actionable shopping suggestions.
   * Returns both the detailed list and aggregate counters for the summary card.
   */
  private analyzeShopping(items: PantryItem[]): Omit<ShoppingState, 'hasAlerts'> {
    const suggestions: ShoppingSuggestion[] = [];
    const summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      basicLow: 0,
      basicOut: 0,
    };

    for (const item of items) {
      const isBasic = Boolean(item.isBasic);
      for (const location of item.locations) {
        const quantity = Number(location.quantity ?? 0);
        const minThreshold = location.minThreshold != null ? Number(location.minThreshold) : null;
        const unit = location.unit ?? this.pantryStore.getItemPrimaryUnit(item);

        let reason: ShoppingReason | null = null;
        let suggestedQuantity = 0;

        if (isBasic && quantity <= 0) {
          reason = 'basic-out';
          suggestedQuantity = this.ensurePositiveQuantity(minThreshold ?? 1);
        } else if (isBasic && minThreshold != null && quantity < minThreshold) {
          reason = 'basic-low';
          suggestedQuantity = this.ensurePositiveQuantity(minThreshold - quantity, minThreshold);
        } else if (minThreshold != null && quantity < minThreshold) {
          reason = 'below-min';
          suggestedQuantity = this.ensurePositiveQuantity(minThreshold - quantity, minThreshold);
        }

        if (reason) {
          suggestions.push({
            item,
            locationId: location.locationId,
            reason,
            suggestedQuantity,
            currentQuantity: this.roundQuantity(quantity),
            minThreshold: minThreshold != null ? this.roundQuantity(minThreshold) : undefined,
            unit,
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
    }

    summary.total = suggestions.length;
    return { suggestions, summary };
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

  /** Format custom location names into title case for display. */
  private toTitleCase(value: string): string {
    const clean = value.replace(/[-_]/g, ' ').trim();
    if (!clean) {
      return 'Unassigned';
    }
    return clean
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}
