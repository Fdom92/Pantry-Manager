import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { animate, state, style, transition, trigger } from '@angular/animations';
import type {
  PantryItemBatchViewModel,
  PantryItemCardViewModel,
} from '../pantry-list/pantry-list.component';
import { ItemBatch, ItemLocationStock } from '@core/models';

@Component({
  selector: 'app-pantry-detail',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './pantry-detail.component.html',
  styleUrls: ['./pantry-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({ height: '0px', opacity: 0, marginTop: '0px' })),
      state('expanded', style({ height: '*', opacity: 1, marginTop: '16px' })),
      transition('collapsed <=> expanded', [
        animate('180ms ease-in-out')
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-2px)' }),
        animate('140ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition('* => *', [
        style({ opacity: 0.4, transform: 'translateY(-1px)' }),
        animate('140ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class PantryDetailComponent {
  @Input({ required: true }) viewModel!: PantryItemCardViewModel;
  @Input() expanded = false;

  @Output() toggleRequested = new EventEmitter<Event | undefined>();
  @Output() summaryKeydown = new EventEmitter<KeyboardEvent>();
  @Output() openBatches = new EventEmitter<Event | undefined>();
  @Output() editRequested = new EventEmitter<Event | undefined>();
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
