import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';
import { DateChipComponent } from '@shared/components/date-chip/date-chip.component';
import { BatchEditStateService } from '@core/services/dashboard/batch-edit-state.service';

@Component({
  selector: 'app-batch-edit-modal',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonChip,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonFooter,
    IonSpinner,
    TranslateModule,
    EntitySelectorFieldComponent,
    DateChipComponent,
  ],
  templateUrl: './batch-edit-modal.component.html',
  styleUrls: ['./batch-edit-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchEditModalComponent {
  readonly state = inject(BatchEditStateService);
}
