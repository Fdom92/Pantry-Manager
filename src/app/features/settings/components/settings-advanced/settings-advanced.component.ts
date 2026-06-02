import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOTIFICATION_IDS } from '@core/constants';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { SettingsNotificationsDevStateService } from '@core/services/settings/settings-notifications-dev-state.service';
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
  IonItemDivider,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AlertController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-advanced',
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
    IonItemDivider,
    IonLabel,
    IonButton,
    IonIcon,
    IonSpinner,
    CommonModule,
    RouterLink,
    TranslateModule,
  ],
  templateUrl: './settings-advanced.component.html',
  styleUrls: ['./settings-advanced.component.scss'],
  providers: [SettingsStateService, SettingsNotificationsDevStateService],
})
export class SettingsAdvancedComponent {
  readonly facade = inject(SettingsStateService);
  readonly dev = inject(SettingsNotificationsDevStateService);
  protected readonly NOTIFICATION_IDS = NOTIFICATION_IDS;

  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
    await this.dev.refreshPending();
  }

  async showPreview(): Promise<void> {
    const result = await this.dev.previewNext();
    const message = result
      ? `${result.title}\n\n${result.body}`
      : this.translate.instant('settings.dev.notifications.previewEmpty');
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('settings.dev.notifications.previewResultTitle'),
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
