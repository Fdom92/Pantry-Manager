import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PantryItem, ShoppingItem } from '@core/models';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonFooter,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-add-purchase-modal',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonFooter,
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

  quantity = 1;
  expiryDate: string | null = null;
  location = 'unassigned';

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly translate: TranslateService,
  ) {}

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
    const trimmed = (id ?? '').trim();
    return trimmed || this.translate.instant('locations.pantry');
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
