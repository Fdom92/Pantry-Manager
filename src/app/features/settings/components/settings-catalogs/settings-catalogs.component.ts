import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { SettingsCatalogsStateService } from '@core/services/settings/pages/settings-catalogs-state.service';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-settings-catalogs',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonProgressBar,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    CommonModule,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './settings-catalogs.component.html',
  styleUrls: ['./settings-catalogs.component.scss'],
  providers: [SettingsCatalogsStateService],
})
export class SettingsCatalogsComponent {
  readonly state = inject(SettingsCatalogsStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }
}
