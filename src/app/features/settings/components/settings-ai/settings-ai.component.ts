import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { SettingsAiStateService } from '@core/services/settings/pages/settings-ai-state.service';
import { ViewWillEnter } from '@ionic/angular';
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
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-ai',
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
    IonTextarea,
    IonButton,
    IonSpinner,
    CommonModule,
    TranslateModule,
  ],
  templateUrl: './settings-ai.component.html',
  styleUrls: ['./settings-ai.component.scss'],
  providers: [SettingsAiStateService],
})
export class SettingsAiComponent implements ViewWillEnter {
  readonly state = inject(SettingsAiStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }
}
