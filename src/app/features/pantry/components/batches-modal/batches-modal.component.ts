import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PantryStateService } from '@core/services/pantry';

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
    IonSpinner,
    IonText,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonChip,
  ],
  templateUrl: './batches-modal.component.html',
  styleUrls: ['./batches-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryBatchesModalComponent {
  // DI
  readonly state = inject(PantryStateService);
}
