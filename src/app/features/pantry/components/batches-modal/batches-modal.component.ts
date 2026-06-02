import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';

@Component({
  selector: 'app-pantry-batches-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IonModal,
    IonButton,
    IonButtons,
    IonIcon,
    IonContent,
    IonHeader,
    IonBadge,
    IonInput,
    IonSpinner,
    IonFooter,
    IonToolbar,
    ExpiryPickerComponent,
    EntitySelectorFieldComponent,
  ],
  templateUrl: './batches-modal.component.html',
  styleUrls: ['./batches-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryBatchesModalComponent {
  // DI
  readonly state = inject(PantryStateService);
}
