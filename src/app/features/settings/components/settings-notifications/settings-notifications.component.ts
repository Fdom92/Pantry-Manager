import { Component, inject } from '@angular/core';
import { SettingsNotificationsStateService } from '@core/services/settings/settings-notifications-state.service';
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
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
    IonToggle,
    IonSelect,
    IonSelectOption,
    TranslateModule,
  ],
  templateUrl: './settings-notifications.component.html',
  styleUrls: ['./settings-notifications.component.scss'],
  providers: [SettingsNotificationsStateService],
})
export class SettingsNotificationsComponent {
  readonly facade = inject(SettingsNotificationsStateService);

  readonly HOUR_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 7);

  formatHour(h: number): string {
    return `${h.toString().padStart(2, '0')}:00`;
  }

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
