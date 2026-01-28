import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
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
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import { ProductAutocompleteComponent } from '@shared/components/product-autocomplete/product-autocomplete.component';

@Component({
  selector: 'app-consume-today-modal',
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
    IonText,
    IonFooter,
    IonSpinner,
    ProductAutocompleteComponent,
  ],
  templateUrl: './consume-today-modal.component.html',
  styleUrls: ['./consume-today-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsumeTodayModalComponent {
  readonly state = inject(DashboardStateService);
}
