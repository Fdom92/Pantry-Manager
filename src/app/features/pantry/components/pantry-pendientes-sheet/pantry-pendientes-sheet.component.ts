import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoodType } from '@core/models/shared/enums.model';
import { PantryPendientesSheetStateService } from '@core/services/pantry/modals/pantry-pendientes-sheet-state.service';
import { IonButton, IonChip, IonContent, IonFooter, IonIcon, IonModal, IonSpinner } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';

@Component({
  selector: 'app-pantry-pendientes-sheet',
  standalone: true,
  imports: [
    IonModal,
    IonContent,
    IonFooter,
    IonButton,
    IonIcon,
    IonChip,
    IonSpinner,
    ExpiryPickerComponent,
    TranslateModule,
  ],
  templateUrl: './pantry-pendientes-sheet.component.html',
  styleUrls: ['./pantry-pendientes-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryPendientesSheetComponent {
  readonly state = inject(PantryPendientesSheetStateService);
  readonly foodTypes = Object.values(FoodType);
}
