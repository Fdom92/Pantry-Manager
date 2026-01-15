import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PantryFacade } from '../../facade/pantry.facade';

@Component({
  selector: 'app-pantry-move-modal',
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
    IonList,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonLabel,
    IonNote,
    IonText,
    IonSpinner,
    IonFooter,
    IonChip,
  ],
  templateUrl: './move-modal.component.html',
  styleUrls: ['./move-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryMoveModalComponent {
  // DI
  readonly state = inject(PantryFacade);
}
