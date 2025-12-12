import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItemBatchViewModel, PantryItemCardViewModel } from '@core/models';
import { ItemBatch, ItemLocationStock } from '@core/models';
import { IonButton, IonCard, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonText } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pantry-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonButton,
    IonIcon,
    IonText,
    IonPopover,
    IonList,
    IonItem,
    IonLabel,
    TranslateModule,
  ],
  templateUrl: './pantry-detail.component.html',
  styleUrls: ['./pantry-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryDetailComponent {
  @Input({ required: true }) viewModel!: PantryItemCardViewModel;
  @Input() expanded = false;

  @Output() toggleRequested = new EventEmitter<Event | undefined>();
  @Output() summaryKeydown = new EventEmitter<KeyboardEvent>();
  @Output() openBatches = new EventEmitter<Event | undefined>();
  @Output() editRequested = new EventEmitter<Event | undefined>();
  @Output() moveRequested = new EventEmitter<Event | undefined>();
  @Output() deleteRequested = new EventEmitter<Event | undefined>();
  @Output() adjustBatchRequested = new EventEmitter<{
    location: ItemLocationStock;
    batch: ItemBatch;
    delta: number;
    event?: Event;
  }>();

  handleToggle(event?: Event): void {
    this.toggleRequested.emit(event);
  }

  handleSummaryKeydown(event: KeyboardEvent): void {
    this.summaryKeydown.emit(event);
  }

  handleOpenBatches(event?: Event): void {
    this.openBatches.emit(event);
  }

  handleEdit(event?: Event): void {
    this.editRequested.emit(event);
  }

  handleMove(event?: Event): void {
    this.moveRequested.emit(event);
  }

  handleDelete(event?: Event): void {
    this.deleteRequested.emit(event);
  }

  handleAdjustBatch(
    location: ItemLocationStock,
    batch: ItemBatch,
    delta: number,
    event?: Event
  ): void {
    this.adjustBatchRequested.emit({ location, batch, delta, event });
  }

  trackBatch(index: number, batch: PantryItemBatchViewModel): string {
    return batch.batch.batchId ?? batch.batch.expirationDate ?? `batch-${index}`;
  }
}
