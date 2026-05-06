import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItem, PantryItemCardViewModel } from '@core/models/pantry';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-pantry-detail',
  standalone: true,
  imports: [IonIcon, NgClass],
  templateUrl: './pantry-detail.component.html',
  styleUrls: ['./pantry-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryDetailComponent {
  @Input({ required: true }) viewModel!: PantryItemCardViewModel;
  @Output() cardClicked = new EventEmitter<Event | undefined>();
  @Output() basicToggle = new EventEmitter<PantryItem>();

  handleCardClick(event?: Event): void {
    this.cardClicked.emit(event);
  }

  onBasicToggle(event: Event): void {
    event.stopPropagation();
    this.basicToggle.emit(this.viewModel.item);
  }
}
