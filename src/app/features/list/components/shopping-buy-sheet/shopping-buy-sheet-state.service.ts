import { Injectable, computed, inject, signal } from '@angular/core';
import { ListStateService } from '@core/services/list/list-state.service';
import type { ShoppingSuggestionWithItem } from '@core/models/list/list.model';

/**
 * Page-scoped state for the shopping list "buy with quantity" bottom sheet.
 * Handles both despensa suggestions and manual items.
 * Fresh items snap to FRESH_QTY.sufficient and bypass this sheet entirely.
 */
@Injectable()
export class ShoppingBuySheetStateService {
  private readonly listState = inject(ListStateService);

  readonly isOpen = signal(false);
  readonly targetSuggestion = signal<ShoppingSuggestionWithItem | null>(null);
  private readonly targetManualId = signal<string | null>(null);
  private readonly targetManualName = signal<string | null>(null);
  readonly pendingQuantity = signal(0);

  readonly canDecrement = computed(() => this.pendingQuantity() > 1);
  readonly targetName = computed(
    () => this.targetSuggestion()?.item.name ?? this.targetManualName()
  );

  openSheet(suggestion: ShoppingSuggestionWithItem): void {
    this.targetSuggestion.set(suggestion);
    this.targetManualId.set(null);
    this.targetManualName.set(null);
    this.pendingQuantity.set(Math.max(1, Math.floor(suggestion.suggestedQuantity || 1)));
    this.isOpen.set(true);
  }

  openSheetForManual(id: string, name: string): void {
    this.targetManualId.set(id);
    this.targetManualName.set(name);
    this.targetSuggestion.set(null);
    this.pendingQuantity.set(1);
    this.isOpen.set(true);
  }

  closeSheet(): void {
    this.isOpen.set(false);
    this.targetSuggestion.set(null);
    this.targetManualId.set(null);
    this.targetManualName.set(null);
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
    const qty = this.pendingQuantity();
    if (qty <= 0) {
      this.closeSheet();
      return;
    }
    this.isOpen.set(false);
    const suggestion = this.targetSuggestion();
    const manualId = this.targetManualId();
    this.targetSuggestion.set(null);
    this.targetManualId.set(null);
    this.pendingQuantity.set(0);
    if (suggestion) {
      await this.listState.markAsBought(suggestion, { quantityOverride: qty });
    } else if (manualId) {
      await this.listState.markManualAsBought(manualId, qty);
    }
  }
}
