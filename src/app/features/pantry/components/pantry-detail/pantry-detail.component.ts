import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { PantryItemCardViewModel } from '@core/models/pantry';
import { IonCard, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pantry-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonIcon,
    TranslateModule,
  ],
  templateUrl: './pantry-detail.component.html',
  styleUrls: ['./pantry-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryDetailComponent {
  @Input({ required: true }) viewModel!: PantryItemCardViewModel;
  @Output() cardClicked = new EventEmitter<Event | undefined>();
  @Output() basicToggle = new EventEmitter<void>();

  handleCardClick(event?: Event): void {
    // ion-card[button] may fire even after stopPropagation on child elements.
    // Guard against clicks originating from the star icon.
    const target = event?.target as HTMLElement | null;
    if (target?.closest('.basic-icon')) return;
    this.cardClicked.emit(event);
  }

  onBasicToggle(event: Event): void {
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.basicToggle.emit();
  }
}
