import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { BatchEditStateService } from '@core/services/dashboard/batch-edit-state.service';

@Component({
  selector: 'app-batch-edit-modal',
  standalone: true,
  imports: [
    IonModal,
    IonButton,
    IonIcon,
    IonSpinner,
    TranslateModule,
    EntitySelectorFieldComponent,
    ExpiryPickerComponent,
  ],
  templateUrl: './batch-edit-modal.component.html',
  styleUrls: ['./batch-edit-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchEditModalComponent {
  readonly state = inject(BatchEditStateService);
}
