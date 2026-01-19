import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import packageJson from '../../../../package.json';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonSpinner,
    CommonModule,
    RouterLink,
    TranslateModule,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  providers: [SettingsStateService],
})
export class SettingsComponent {
  readonly facade = inject(SettingsStateService);
  readonly appVersion = packageJson.version ?? '0.0.0';

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
