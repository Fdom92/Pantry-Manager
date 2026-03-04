import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { PantryEditItemModalStateService } from '@core/services/pantry/modals/pantry-edit-item-modal-state.service';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntityAutocompleteComponent } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { DateChipComponent } from '@shared/components/date-chip/date-chip.component';

@Component({
  selector: 'app-pantry-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonInput,
    IonCheckbox,
    IonFooter,
    IonSpinner,
    EntityAutocompleteComponent,
    DateChipComponent,
  ],
  templateUrl: './edit-item-modal.component.html',
  styleUrls: ['./edit-item-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  providers: [PantryEditItemModalStateService],
})
export class PantryEditItemModalComponent {
  readonly state = inject(PantryEditItemModalStateService);
}
