import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { frozenQuantity } from '@core/domain/pantry';
import { IonButton, IonChip, IonContent, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';

@Component({
  selector: 'app-pantry-quantity-sheet',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
    IonChip,
    IonLabel,
    ExpiryPickerComponent,
    TranslateModule,
  ],
  templateUrl: './pantry-quantity-sheet.component.html',
  styleUrls: ['./pantry-quantity-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryQuantitySheetComponent {
  @Input({ required: true }) item!: PantryItem;
  @Input({ required: true }) totalQuantity!: number;
  @Input({ required: true }) pendingChange = 0;
  @Input({ required: true }) quantityUnit?: string;
  @Input() pendingExpiryDate?: string;
  @Input() pendingNoExpiry = false;
  @Output() increment = new EventEmitter<void>();
  @Output() decrement = new EventEmitter<void>();
  @Output() emptyOut = new EventEmitter<void>();
  @Output() expiryDateChange = new EventEmitter<string | undefined>();
  @Output() noExpiryToggle = new EventEmitter<void>();
  @Output() viewDetails = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<Event | undefined>();
  @Output() deleteRequested = new EventEmitter<Event | undefined>();
  @Output() closeRequested = new EventEmitter<void>();
  @Input() locations: string[] = [];
  @Output() openOne = new EventEmitter<void>();
  @Output() moveOne = new EventEmitter<string>();
  @Output() freezeOne = new EventEmitter<void>();
  @Output() thawOne = new EventEmitter<void>();
  @Output() discardOne = new EventEmitter<void>();

  showMoveTargets = false;

  /** One-tap actions work on pantry lots; a fresh product keeps a single level-based lot. */
  get showQuickActions(): boolean {
    return this.item.productType !== 'fresh' && this.totalQuantity > 0;
  }

  get canOpen(): boolean {
    return (this.item.batches ?? []).some(b => (b.quantity ?? 0) > 0 && !b.opened && !b.frozenAt);
  }

  get canFreeze(): boolean {
    return frozenQuantity(this.item) < this.totalQuantity;
  }

  get hasFrozen(): boolean {
    return frozenQuantity(this.item) > 0;
  }

  get displayQuantity(): number {
    return this.totalQuantity + this.pendingChange;
  }

  get hasChanges(): boolean {
    return this.pendingChange !== 0;
  }

  get isDecreasing(): boolean {
    return this.pendingChange < 0;
  }

  get zeroHintKey(): string | null {
    if (this.displayQuantity !== 0) return null;
    return this.item.isBasic
      ? 'pantry.quantitySheet.zeroHintBasic'
      : 'pantry.quantitySheet.zeroHint';
  }

  handleIncrement(): void {
    this.increment.emit();
  }

  handleDecrement(): void {
    this.decrement.emit();
  }

  handleEmptyOut(): void {
    this.emptyOut.emit();
  }

  handleViewDetails(): void {
    this.viewDetails.emit();
  }

  handleEdit(): void {
    this.editRequested.emit();
  }

  handleDelete(): void {
    this.deleteRequested.emit();
  }

  handleClose(): void {
    this.closeRequested.emit();
  }
}
