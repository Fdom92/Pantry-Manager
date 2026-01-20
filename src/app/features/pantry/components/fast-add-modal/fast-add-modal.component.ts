import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';

@Component({
  selector: 'app-pantry-fast-add-modal',
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
    IonTextarea,
    IonFooter,
    IonSpinner,
  ],
  templateUrl: './fast-add-modal.component.html',
  styleUrls: ['./fast-add-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryFastAddModalComponent {
  readonly state = inject(PantryStateService);
}

