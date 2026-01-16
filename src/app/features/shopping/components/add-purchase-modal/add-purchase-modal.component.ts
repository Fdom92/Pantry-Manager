import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShoppingStateService } from '@core/services/shopping';
import { normalizeLocationId } from '@core/utils/normalization.util';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-add-purchase-modal',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule,
  ],
  templateUrl: './add-purchase-modal.component.html',
  styleUrls: ['./add-purchase-modal.component.scss'],
})
export class AddPurchaseModalComponent {
  // DI (feature-scoped)
  readonly state = inject(ShoppingStateService);
  // DATA (local form state)
  quantity = 1;
  expiryDate: string | null = null;
  location = 'unassigned';
  private locationOptionCache: string[] = [];
  // GETTERS
  get locationOptions(): string[] {
    return this.locationOptionCache;
  }
  get canConfirm(): boolean {
    return this.quantity > 0 && Boolean(this.location);
  }

  constructor() {
    effect(() => {
      const suggestion = this.state.purchaseTarget();
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
    return this.state.getLocationLabel(id);
  }

  onQuantityInput(event: CustomEvent): void {
    const rawValue = (event.detail as any)?.value;
    const parsed = Number(rawValue);
    this.quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  cancel(): void {
    this.state.closePurchaseModal();
  }

  async submit(): Promise<void> {
    if (!this.canConfirm) {
      return;
    }
    const payload = {
      quantity: this.quantity,
      expiryDate: this.expiryDate || null,
      location: this.location,
    };
    await this.state.confirmPurchaseForTarget(payload);
  }
}
