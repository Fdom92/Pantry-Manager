import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AppThemePreference, BaseDoc } from '@core/models';
import { AppPreferencesService, StorageService } from '@core/services';
import packageJson from '../../../../package.json';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RevenuecatService } from '@core/services/revenuecat.service';

const TOAST_DURATION = 1800;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, TranslateModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent {
  readonly appVersion = packageJson.version ?? '0.0.0';

  readonly exportingData = signal(false);
  readonly resettingData = signal(false);
  readonly isPro$ = this.revenuecat.isPro$;
  readonly updatingTheme = signal(false);
  readonly themePreference = computed<AppThemePreference>(() => this.appPreferencesService.preferences().theme);

  constructor(
    private readonly toastCtrl: ToastController,
    private readonly appPreferencesService: AppPreferencesService,
    private readonly storage: StorageService<BaseDoc>,
    private readonly translate: TranslateService,
    private readonly revenuecat: RevenuecatService,
    private readonly navCtrl: NavController,
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.ensurePreferencesLoaded();
  }

  async onResetApp(): Promise<void> {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            this.translate.instant('settings.reset.confirm')
          );

    if (!confirmed) {
      return;
    }

    this.resettingData.set(true);
    try {
      await this.storage.clearAll();
      await this.appPreferencesService.reload();
      await this.presentToast(this.translate.instant('settings.reset.success'), 'success');
    } catch (err) {
      console.error('[SettingsComponent] onResetApp error', err);
      await this.presentToast(this.translate.instant('settings.reset.error'), 'danger');
    } finally {
      this.resettingData.set(false);
    }
  }

  async onExportData(): Promise<void> {
    if (typeof document === 'undefined') {
      await this.presentToast(this.translate.instant('settings.export.unavailable'), 'warning');
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
      await this.presentToast(
        shared
          ? this.translate.instant('settings.export.readyToShare')
          : this.translate.instant('settings.export.success'),
        'success'
      );
    } catch (err) {
      console.error('[SettingsComponent] onExportData error', err);
      await this.presentToast(this.translate.instant('settings.export.error'), 'danger');
    } finally {
      this.exportingData.set(false);
    }
  }

  async onThemeChanged(value: string | number | null | undefined): Promise<void> {
    const normalized = typeof value === 'string' ? value : value != null ? String(value) : null;
    const nextTheme: AppThemePreference =
      normalized === 'light' || normalized === 'dark'
        ? normalized
        : 'system';

    if (nextTheme === this.themePreference()) {
      return;
    }

    this.updatingTheme.set(true);
    try {
      const current = this.appPreferencesService.preferences();
      await this.appPreferencesService.savePreferences({
        ...current,
        theme: nextTheme,
      });
    } catch (err) {
      console.error('[SettingsComponent] onThemeChanged error', err);
      await this.presentToast(this.translate.instant('settings.appearance.error'), 'danger');
    } finally {
      this.updatingTheme.set(false);
    }
  }

  private async ensurePreferencesLoaded(): Promise<void> {
    try {
      await this.appPreferencesService.getPreferences();
    } catch (err) {
      console.error('[SettingsComponent] ensurePreferencesLoaded error', err);
      await this.presentToast(this.translate.instant('settings.loadError'), 'danger');
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
        title: this.translate.instant('settings.export.shareTitle'),
        text: this.translate.instant('settings.export.shareText'),
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

  private ensureProAccess(): boolean {
    if (this.revenuecat.isPro()) {
      return true;
    }
    void this.navCtrl.navigateForward('/upgrade');
    return false;
  }
}
