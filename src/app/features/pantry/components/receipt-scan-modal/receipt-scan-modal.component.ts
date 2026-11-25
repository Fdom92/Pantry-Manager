import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonCheckbox,
  IonChip,
  IonFooter,
  IonIcon,
  IonLabel,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PantryReceiptScanModalStateService } from '@core/services/pantry/modals/pantry-receipt-scan-modal-state.service';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { FoodTypePickerComponent } from '@shared/components/food-type-picker/food-type-picker.component';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';

@Component({
  selector: 'app-pantry-receipt-scan-modal',
  standalone: true,
  imports: [
    IonModal,
    IonButton,
    IonIcon,
    IonLabel,
    IonSpinner,
    IonCheckbox,
    IonChip,
    IonFooter,
    TranslateModule,
    ProPaywallCardComponent,
    FoodTypePickerComponent,
    ExpiryPickerComponent,
  ],
  templateUrl: './receipt-scan-modal.component.html',
  styleUrls: ['./receipt-scan-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryReceiptScanModalComponent {
  readonly state = inject(PantryReceiptScanModalStateService);
  readonly storagePlaces = ['pantry', 'fresh'] as const;
}
