import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader,
  IonIcon, IonInput, IonItem, IonLabel, IonModal, IonSpinner,
  IonTitle, IonToggle, IonToolbar,
} from '@ionic/angular/standalone';
import { QuickDateChipsComponent } from '@shared/components/quick-date-chips/quick-date-chips.component';
import { PantryFreshEditModalStateService } from '@core/services/pantry/modals/pantry-fresh-edit-modal-state.service';
import type { FreshState } from '@core/domain/pantry';

@Component({
  selector: 'app-fresh-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule,
    IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonInput, IonLabel, IonToggle, IonIcon,
    IonFooter, IonSpinner, QuickDateChipsComponent,
  ],
  templateUrl: './fresh-edit-item-modal.component.html',
  styleUrls: ['./fresh-edit-item-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryFreshEditModalStateService],
})
export class FreshEditItemModalComponent {
  readonly state = inject(PantryFreshEditModalStateService);

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }

  onStateClick(state: FreshState): void {
    this.state.setState(state);
  }

  onDateSelected(date: string | null): void {
    this.state.setExpirationDate(date);
  }
}
