import { Component, computed, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { PantryStoreService } from '@core/store/pantry-store.service';
import { SeedService } from '@core/services';
import { PantryItem } from '@core/models';

type ShoppingReason = 'below-min' | 'basic-low' | 'basic-out';

interface ShoppingSuggestion {
  item: PantryItem;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
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

  async ionViewWillEnter(): Promise<void> {
    await this.seedService.ensureSeedData();
    await this.pantryStore.loadAll();
  }

  async refreshList(): Promise<void> {
    await this.pantryStore.refresh();
  }

  toggleSummary(): void {
    this.summaryExpanded.update(isOpen => !isOpen);
  }

  isProcessing(id: string | undefined): boolean {
    return id ? this.processingIds().has(id) : false;
  }

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
      await this.pantryStore.adjustQuantity(id, suggestion.suggestedQuantity);
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

  getUnit(item: PantryItem): string {
    return item.stock?.unit ?? 'unit';
  }

  private analyzeShopping(items: PantryItem[]): Omit<ShoppingState, 'hasAlerts'> {
    const suggestions: ShoppingSuggestion[] = [];
    const summary: ShoppingSummary = {
      total: 0,
      belowMin: 0,
      basicLow: 0,
      basicOut: 0,
    };

    for (const item of items) {
      const stock = item.stock;
      const quantity = stock ? Number(stock.quantity ?? 0) : 0;
      const minThreshold = stock?.minThreshold;
      const isBasic = Boolean(stock?.isBasic);

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
          reason,
          suggestedQuantity,
          currentQuantity: this.roundQuantity(quantity),
          minThreshold: minThreshold != null ? this.roundQuantity(minThreshold) : undefined,
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
    return { suggestions, summary };
  }

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

  private roundQuantity(value: number): number {
    const num = Number(value ?? 0);
    if (!isFinite(num)) {
      return 0;
    }
    return Math.round(num * 100) / 100;
  }
}
