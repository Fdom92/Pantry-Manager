import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItem, PantryItemCardViewModel } from '@core/models/pantry';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { frozenQuantity } from '@core/domain/pantry';

@Component({
  selector: 'app-pantry-detail',
  standalone: true,
  imports: [IonIcon, NgClass, TranslateModule],
  templateUrl: './pantry-detail.component.html',
  styleUrls: ['./pantry-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryDetailComponent {
  @Input({ required: true }) viewModel!: PantryItemCardViewModel;
  @Input() showStarHint = false;
  @Output() cardClicked = new EventEmitter<Event | undefined>();
  @Output() basicToggle = new EventEmitter<PantryItem>();

  get frozenUnits(): number {
    return frozenQuantity(this.viewModel.item);
  }

  get hasOpened(): boolean {
    return (this.viewModel.item.batches ?? []).some(b => b.opened && !b.frozenAt && (b.quantity ?? 0) > 0);
  }

  handleCardClick(event?: Event): void {
    this.cardClicked.emit(event);
  }

  onBasicToggle(event: Event): void {
    event.stopPropagation();
    this.basicToggle.emit(this.viewModel.item);
  }
}
