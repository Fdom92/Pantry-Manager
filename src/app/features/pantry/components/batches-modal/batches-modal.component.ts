import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';
import { DateChipComponent } from '@shared/components/date-chip/date-chip.component';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';

@Component({
  selector: 'app-pantry-batches-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonInput,
    IonSpinner,
    DateChipComponent,
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
