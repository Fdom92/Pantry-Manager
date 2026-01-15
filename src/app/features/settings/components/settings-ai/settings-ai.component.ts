import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TOAST_DURATION } from '@core/constants';
import { AppPreferencesService } from '@core/services';
import { ToastController, ViewWillEnter } from '@ionic/angular';
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
import { TranslateModule, TranslateService } from '@ngx-translate/core';

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
})
export class SettingsAiComponent implements ViewWillEnter {
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  readonly plannerMemory = signal('');
  readonly originalPlannerMemory = signal('');
  readonly isSaving = signal(false);
  readonly isLoading = signal(false);
  readonly plannerMemoryLimit = 2000;
  readonly hasChanges = computed(() => this.plannerMemory() !== this.originalPlannerMemory());

  async ionViewWillEnter(): Promise<void> {
    await this.loadPlannerMemory();
  }

  onPlannerMemoryInput(value: string | null | undefined): void {
    const normalized = (value ?? '').slice(0, this.plannerMemoryLimit);
    this.plannerMemory.set(normalized);
  }

  async savePlannerMemory(): Promise<void> {
    if (this.isSaving() || this.isLoading() || !this.hasChanges()) {
      return;
    }
    this.isSaving.set(true);
    try {
      const current = await this.appPreferences.getPreferences();
      const next = (this.plannerMemory() ?? '').trim();
      await this.appPreferences.savePreferences({
        ...current,
        plannerMemory: next,
      });
      this.originalPlannerMemory.set(next);
      this.plannerMemory.set(next);
      await this.presentToast(this.translate.instant('settings.ai.saveSuccess'), 'success');
    } catch (err) {
      console.error('[SettingsAiComponent] savePlannerMemory error', err);
      await this.presentToast(this.translate.instant('settings.ai.saveError'), 'danger');
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadPlannerMemory(): Promise<void> {
    this.isLoading.set(true);
    try {
      const prefs = await this.appPreferences.getPreferences();
      const stored = prefs.plannerMemory ?? '';
      this.plannerMemory.set(stored);
      this.originalPlannerMemory.set(stored);
    } catch (err) {
      console.error('[SettingsAiComponent] loadPlannerMemory error', err);
      await this.presentToast(this.translate.instant('settings.loadError'), 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'medium'
  ): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: TOAST_DURATION,
      position: 'bottom',
    });
    await toast.present();
  }
}
