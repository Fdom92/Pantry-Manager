import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonCheckbox,
  IonFooter,
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PantryReceiptScanModalStateService } from '@core/services/pantry/modals/pantry-receipt-scan-modal-state.service';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';

@Component({
  selector: 'app-pantry-receipt-scan-modal',
  standalone: true,
  imports: [IonModal, IonButton, IonIcon, IonSpinner, IonCheckbox, IonFooter, TranslateModule, ProPaywallCardComponent],
  templateUrl: './receipt-scan-modal.component.html',
  styleUrls: ['./receipt-scan-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryReceiptScanModalComponent {
  readonly state = inject(PantryReceiptScanModalStateService);
}
