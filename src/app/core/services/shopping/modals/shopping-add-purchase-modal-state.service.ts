import { Injectable, effect, inject } from '@angular/core';
import { normalizeLocationId } from '@core/utils/normalization.util';
import { ShoppingStateService } from '../shopping-state.service';

@Injectable()
export class ShoppingAddPurchaseModalStateService {
  private readonly shopping = inject(ShoppingStateService);

  quantity = 1;
  expiryDate: string | null = null;
  location = 'unassigned';
  private locationOptionCache: string[] = [];

  get locationOptions(): string[] {
    return this.locationOptionCache;
  }

  get canConfirm(): boolean {
    return this.quantity > 0 && Boolean(this.location);
  }

  constructor() {
    effect(() => {
      const suggestion = this.shopping.purchaseTarget();
      if (!suggestion) {
        this.locationOptionCache = [];
        this.quantity = 1;
        this.expiryDate = null;
        this.location = 'unassigned';
        return;
      }

      const product = suggestion.item;
      const options = new Set<string>();
      const fromSuggestion = normalizeLocationId(suggestion.locationId);
      if (fromSuggestion) {
        options.add(fromSuggestion);
      }
      if (Array.isArray(product?.locations)) {
        product.locations.forEach(loc => {
          const id = normalizeLocationId(loc.locationId);
          if (id) {
            options.add(id);
          }
        });
      }
      if (!options.size) {
        options.add('pantry');
      }
      this.locationOptionCache = Array.from(options);

      const suggestedQuantity = Number(suggestion.suggestedQuantity ?? 0) || Number(product?.minThreshold ?? 0);
      this.quantity = suggestedQuantity > 0 ? suggestedQuantity : 1;

      const defaultLocation =
        normalizeLocationId(suggestion.locationId) ||
        (Array.isArray(product?.locations) ? normalizeLocationId(product.locations[0]?.locationId) : '') ||
        'pantry';
      this.location = defaultLocation || 'pantry';
      this.expiryDate = null;
    });
  }

  getLocationLabel(id: string): string {
    return this.shopping.getLocationLabel(id);
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
      location: this.location,
    };
    await this.shopping.confirmPurchaseForTarget(payload);
  }
}
