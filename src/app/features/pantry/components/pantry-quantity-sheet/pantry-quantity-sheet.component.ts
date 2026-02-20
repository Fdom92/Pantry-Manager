import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pantry-quantity-sheet',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
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
  @Output() increment = new EventEmitter<void>();
  @Output() decrement = new EventEmitter<void>();
  @Output() viewDetails = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<Event | undefined>();
  @Output() deleteRequested = new EventEmitter<Event | undefined>();
  @Output() close = new EventEmitter<void>();

  get displayQuantity(): number {
    return this.totalQuantity + this.pendingChange;
  }

  get hasChanges(): boolean {
    return this.pendingChange !== 0;
  }

  get isDecreasing(): boolean {
    return this.pendingChange < 0;
  }

  handleIncrement(): void {
    this.increment.emit();
  }

  handleDecrement(): void {
    this.decrement.emit();
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
    this.close.emit();
  }
}
