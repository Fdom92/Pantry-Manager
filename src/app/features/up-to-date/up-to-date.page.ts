import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UpToDateStateService } from '@core/services/up-to-date';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonToggle,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { UpToDateFacade } from './facade/up-to-date.facade';

@Component({
  selector: 'app-up-to-date',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EmptyStateComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonText,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonToggle,
    IonSpinner,
  ],
  templateUrl: './up-to-date.page.html',
  styleUrls: ['./up-to-date.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [UpToDateStateService, UpToDateFacade],
})
export class UpToDatePage {
  readonly facade = inject(UpToDateFacade);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  ionViewWillLeave(): void {
    this.facade.ionViewWillLeave();
  }
}

