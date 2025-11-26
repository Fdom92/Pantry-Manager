import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { PantryItem } from '@core/models';
import { getLocationDisplayName } from '@core/utils';

export interface ShoppingItem {
  id?: string;
  productId?: string;
  quantity?: number;
  suggestedQuantity?: number;
  locationId?: string;
}

export type PantryProduct = PantryItem;

@Component({
  selector: 'app-add-purchase-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './add-purchase-modal.component.html',
  styleUrls: ['./add-purchase-modal.component.scss'],
})
export class AddPurchaseModalComponent implements OnInit {
  @Input() item!: ShoppingItem;
  @Input() product!: PantryProduct;

  @Output() confirm = new EventEmitter<{
    quantity: number;
    expiryDate?: string | null;
    location: string;
  }>();

  quantity = 1;
  expiryDate: string | null = null;
  location = 'unassigned';

  constructor(private readonly modalCtrl: ModalController) {}

  ngOnInit(): void {
    this.initializeDefaults();
  }

  get locationOptions(): string[] {
    const options = new Set<string>();
    const fromItem = (this.item?.locationId ?? '').trim();
    if (fromItem) {
      options.add(fromItem);
    }
    if (Array.isArray(this.product?.locations)) {
      this.product.locations.forEach(loc => {
        const id = (loc.locationId ?? '').trim();
        if (id) {
          options.add(id);
        }
      });
    }
    if (!options.size) {
      options.add('pantry');
    }
    return Array.from(options);
  }

  get canConfirm(): boolean {
    return this.quantity > 0 && Boolean(this.location);
  }

  getLocationLabel(id: string): string {
    return getLocationDisplayName(id, 'Despensa');
  }

  onQuantityInput(event: CustomEvent): void {
    const rawValue = (event.detail as any)?.value;
    const parsed = Number(rawValue);
    this.quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  cancel(): void {
    this.modalCtrl.dismiss();
  }

  submit(): void {
    if (!this.canConfirm) {
      return;
    }
    const payload = {
      quantity: this.quantity,
      expiryDate: this.expiryDate || null,
      location: this.location,
    };
    this.confirm.emit(payload);
    this.modalCtrl.dismiss(payload);
  }

  private initializeDefaults(): void {
    const suggestedQuantity =
      Number(this.item?.suggestedQuantity ?? this.item?.quantity) || Number(this.product?.minThreshold ?? 0);
    this.quantity = suggestedQuantity > 0 ? suggestedQuantity : 1;

    const defaultLocation =
      (this.item?.locationId ?? '').trim() ||
      (Array.isArray(this.product?.locations) ? this.product.locations[0]?.locationId : '') ||
      'pantry';
    this.location = defaultLocation || 'pantry';
  }
}
