import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import {
  IonBackButton,
  IonButton,
  IonButtons,
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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import packageJson from '../../../../package.json';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-settings',
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
  private readonly scheduler = inject(NotificationSchedulerService);
  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isDev = !environment.production;
  readonly isPro = this.facade.isPro;
  readonly isTestingNotification = signal(false);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  async testNotification(): Promise<void> {
    if (this.isTestingNotification()) return;
    this.isTestingNotification.set(true);
    try {
      await this.scheduler.scheduleTestNotification();
    } finally {
      this.isTestingNotification.set(false);
    }
  }
}
