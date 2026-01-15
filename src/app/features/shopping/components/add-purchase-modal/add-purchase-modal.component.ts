import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PantryItem } from '@core/models/pantry';
import { ShoppingItem } from '@core/models/shopping';
import { normalizeLocationId } from '@core/utils/normalization.util';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

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
export class AddPurchaseModalComponent implements OnInit {
  @Input() item: ShoppingItem | null = null;
  @Input() product: PantryItem | null = null;
  @Output() confirm = new EventEmitter<{
    quantity: number;
    expiryDate?: string | null;
    location: string;
  }>();
  // DI
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);
  // Data
  quantity = 1;
  expiryDate: string | null = null;
  location = 'unassigned';
  // Getters
  get locationOptions(): string[] {
    const options = new Set<string>();
    const fromItem = normalizeLocationId(this.item?.locationId);
    if (fromItem) {
      options.add(fromItem);
    }
    if (Array.isArray(this.product?.locations)) {
      this.product.locations.forEach(loc => {
        const id = normalizeLocationId(loc.locationId);
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

  ngOnInit(): void {
    this.initializeDefaults();
  }

  getLocationLabel(id: string): string {
    return normalizeLocationId(id, this.translate.instant('locations.pantry'));
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
      normalizeLocationId(this.item?.locationId) ||
      (Array.isArray(this.product?.locations) ? normalizeLocationId(this.product.locations[0]?.locationId) : '') ||
      'pantry';
    this.location = defaultLocation || 'pantry';
  }
}
