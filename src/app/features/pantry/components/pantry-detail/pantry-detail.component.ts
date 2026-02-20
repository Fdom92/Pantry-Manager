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

  handleCardClick(event?: Event): void {
    this.cardClicked.emit(event);
  }

}
