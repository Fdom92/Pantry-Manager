import { Injectable, effect, inject } from '@angular/core';
import { ShoppingStateService } from '../shopping-state.service';

@Injectable()
export class ShoppingAddPurchaseModalStateService {
  private readonly shopping = inject(ShoppingStateService);

  quantity = 1;
  expiryDate: string | null = null;
  get canConfirm(): boolean {
    return this.quantity > 0;
  }

  constructor() {
    effect(() => {
      const suggestion = this.shopping.purchaseTarget();
      if (!suggestion) {
        this.quantity = 1;
        this.expiryDate = null;
        return;
      }

      const product = suggestion.item;
      const suggestedQuantity = Number(suggestion.suggestedQuantity ?? 0) || Number(product?.minThreshold ?? 0);
      this.quantity = suggestedQuantity > 0 ? suggestedQuantity : 1;
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
}
