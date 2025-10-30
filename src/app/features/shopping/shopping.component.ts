import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { PantryService, SeedService } from '@core/services';
import { PantryItem } from '@core/models';

type ShoppingReason = 'below-min' | 'basic-low' | 'basic-out';

interface ShoppingSuggestion {
  item: PantryItem;
  reason: ShoppingReason;
  suggestedQuantity: number;
  currentQuantity: number;
  minThreshold?: number;
}

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
})
export class ShoppingComponent {
  shoppingItems: ShoppingSuggestion[] = [];
  loading = false;
  summary = {
    total: 0,
    belowMin: 0,
    basicLow: 0,
    basicOut: 0,
  };

  readonly reasonLabels: Record<ShoppingReason, string> = {
    'below-min': 'Below minimum',
    'basic-low': 'Basic item below minimum',
    'basic-out': 'Basic item out of stock',
  };

  constructor(
    private readonly pantryService: PantryService,
    private readonly seedService: SeedService,
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.seedService.ensureSeedData();
    await this.loadShoppingList();
  }

  async refreshList(): Promise<void> {
    await this.loadShoppingList();
  }

  get hasAlerts(): boolean {
    return this.summary.total > 0;
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

  private async loadShoppingList(): Promise<void> {
    this.loading = true;
    try {
      const items = await this.pantryService.getAll();
      const suggestions = this.buildShoppingList(items);
      this.shoppingItems = suggestions;
      this.updateSummary(suggestions);
    } finally {
      this.loading = false;
    }
  }

  private buildShoppingList(items: PantryItem[]): ShoppingSuggestion[] {
    const suggestions: ShoppingSuggestion[] = [];

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
      }
    }

    return suggestions;
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

  private updateSummary(suggestions: ShoppingSuggestion[]): void {
    const summary = {
      total: suggestions.length,
      belowMin: 0,
      basicLow: 0,
      basicOut: 0,
    };

    for (const suggestion of suggestions) {
      switch (suggestion.reason) {
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

    this.summary = summary;
  }
}
