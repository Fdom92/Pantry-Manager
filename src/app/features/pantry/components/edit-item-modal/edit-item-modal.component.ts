import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { PantryEditItemModalStateService } from '@core/services/pantry/modals/pantry-edit-item-modal-state.service';
import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonModal,
  IonSpinner
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';

@Component({
  selector: 'app-pantry-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    IonModal,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonInput,
    IonCheckbox,
    IonSpinner,
    EntitySelectorFieldComponent,
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
