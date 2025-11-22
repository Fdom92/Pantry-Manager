import { Component, signal } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseDoc } from '@core/models';
import { AppPreferencesService, StorageService } from '@core/services';
import packageJson from '../../../../package.json';

const TOAST_DURATION = 1800;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent {
  readonly appVersion = packageJson.version ?? '0.0.0';

  readonly exportingData = signal(false);
  readonly resettingData = signal(false);

  constructor(
    private readonly toastCtrl: ToastController,
    private readonly appPreferencesService: AppPreferencesService,
    private readonly storage: StorageService<BaseDoc>,
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.ensurePreferencesLoaded();
  }

  async onResetApp(): Promise<void> {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Esto eliminará TODOS los datos locales de la aplicación.\n¿Quieres continuar?'
          );

    if (!confirmed) {
      return;
    }

    this.resettingData.set(true);
    try {
      await this.storage.clearAll();
      await this.appPreferencesService.reload();
      await this.presentToast('Datos locales eliminados.', 'success');
    } catch (err) {
      console.error('[SettingsComponent] onResetApp error', err);
      await this.presentToast('No se pudo limpiar la aplicación.', 'danger');
    } finally {
      this.resettingData.set(false);
    }
  }

  async onExportData(): Promise<void> {
    if (typeof document === 'undefined') {
      await this.presentToast('La exportación no está disponible en este entorno.', 'warning');
      return;
    }

    this.exportingData.set(true);
    try {
      const docs = (await this.storage.all()).filter(doc => !doc._id.startsWith('_design/'));
      const json = JSON.stringify(docs, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const filename = this.buildExportFileName();
      const file = new File([blob], filename, { type: 'application/json' });

      const shared = await this.tryShareFile(file);
      if (!shared) {
        this.triggerDownload(blob, filename);
      }
      await this.presentToast(shared ? '📤 Datos listos para compartir.' : '📦 Datos exportados.', 'success');
    } catch (err) {
      console.error('[SettingsComponent] onExportData error', err);
      await this.presentToast('No se pudieron exportar los datos.', 'danger');
    } finally {
      this.exportingData.set(false);
    }
  }

  private async ensurePreferencesLoaded(): Promise<void> {
    try {
      await this.appPreferencesService.getPreferences();
    } catch (err) {
      console.error('[SettingsComponent] ensurePreferencesLoaded error', err);
      await this.presentToast('Ocurrió un problema cargando los ajustes.', 'danger');
    }
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private buildExportFileName(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');
    return `pantry-manager-backup-${timestamp}.json`;
  }

  private async tryShareFile(file: File): Promise<boolean> {
    const canUseWebShare =
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      navigator.canShare({ files: [file] });

    if (!canUseWebShare) {
      return false;
    }

    try {
      await navigator.share({
        title: 'Pantry Manager - Respaldo',
        text: 'Exporta o comparte tu copia de seguridad.',
        files: [file],
      });
      return true;
    } catch (err) {
      console.warn('[SettingsComponent] Web Share failed, falling back to download', err);
      return false;
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
