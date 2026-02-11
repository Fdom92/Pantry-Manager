import { Injectable, effect, inject } from '@angular/core';
import { ShoppingStateService } from './shopping-state.service';

@Injectable()
export class ShoppingAddPurchaseModalStateService {
  // DI
  private readonly shopping = inject(ShoppingStateService);
  // VARIABLES
  quantity = 1;
  expiryDate: string | null = null;
  // GETTERS
  get canConfirm(): boolean {
    return this.quantity > 0;
  }

  constructor() {
    effect(() => {
      const suggestion = this.shopping.purchaseTarget();
      if (!suggestion) {
        this.resetForm();
        return;
      }

      this.quantity = this.getSuggestedQuantity(suggestion);
      this.expiryDate = null;
    });
  }

  onQuantityInput(event: CustomEvent): void {
    const rawValue = (event.detail as any)?.value;
    const parsed = Number(rawValue);
    this.quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  close(): void {
    this.shopping.dismissPurchaseModal();
  }

  async submitPurchase(): Promise<void> {
    if (!this.canConfirm) {
      return;
    }
    const payload = {
      quantity: this.quantity,
      expiryDate: this.expiryDate || null,
    };
    await this.shopping.confirmPurchaseForTarget(payload);
  }

  private resetForm(): void {
    this.quantity = 1;
    this.expiryDate = null;
  }

  private getSuggestedQuantity(suggestion: { suggestedQuantity?: number; item?: { minThreshold?: number | null } }): number {
    const raw = Number(suggestion.suggestedQuantity ?? 0) || Number(suggestion.item?.minThreshold ?? 0);
    return raw > 0 ? raw : 1;
  }
}
