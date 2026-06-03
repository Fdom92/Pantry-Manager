import { Injectable, computed, inject, signal } from '@angular/core';
import { ListStateService } from '@core/services/list/list-state.service';
import type { ShoppingSuggestionWithItem } from '@core/models/list/list.model';

/**
 * Page-scoped state for the shopping list "buy with quantity" bottom sheet.
 * Despensa items only — fresh items snap to FRESH_QTY.sufficient via the
 * existing markAsBought path.
 */
@Injectable()
export class ShoppingBuySheetStateService {
  private readonly listState = inject(ListStateService);

  readonly isOpen = signal(false);
  readonly targetSuggestion = signal<ShoppingSuggestionWithItem | null>(null);
  readonly pendingQuantity = signal(0);

  readonly canDecrement = computed(() => this.pendingQuantity() > 1);

  openSheet(suggestion: ShoppingSuggestionWithItem): void {
    this.targetSuggestion.set(suggestion);
    this.pendingQuantity.set(Math.max(1, Math.floor(suggestion.suggestedQuantity || 1)));
    this.isOpen.set(true);
  }

  closeSheet(): void {
    this.isOpen.set(false);
    this.targetSuggestion.set(null);
    this.pendingQuantity.set(0);
  }

  increment(): void {
    this.pendingQuantity.update(q => q + 1);
  }

  decrement(): void {
    if (this.canDecrement()) {
      this.pendingQuantity.update(q => q - 1);
    }
  }

  async confirm(): Promise<void> {
    const suggestion = this.targetSuggestion();
    const qty = this.pendingQuantity();
    if (!suggestion || qty <= 0) {
      this.closeSheet();
      return;
    }
    this.isOpen.set(false);
    await this.listState.markAsBought(suggestion, { quantityOverride: qty });
    this.targetSuggestion.set(null);
    this.pendingQuantity.set(0);
  }
}
