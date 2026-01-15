import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { EXPORT_PATH, IMPORT_EMPTY_ERROR, IMPORT_EMPTY_INVALID, TOAST_DURATION } from '@core/constants';
import { buildExportFileName, parseBackup } from '@core/domain/settings';
import type { AppThemePreference } from '@core/models';
import type { BaseDoc } from '@core/models/shared';
import { NavController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SettingsStoreService } from './settings-store.service';

@Injectable()
export class SettingsStateService {
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly store = inject(SettingsStoreService);
  private readonly navCtrl = inject(NavController);

  readonly isPro$ = this.store.isPro$;
  readonly themePreference = this.store.themePreference;

  readonly isExportingData = signal(false);
  readonly isImportingData = signal(false);
  readonly isResettingData = signal(false);
  readonly isUpdatingTheme = signal(false);

  async ionViewWillEnter(): Promise<void> {
    await this.ensurePreferencesLoaded();
  }

  async resetApplicationData(): Promise<void> {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(this.translate.instant('settings.reset.confirm'));

    if (!confirmed) {
      return;
    }

    this.isResettingData.set(true);
    try {
      await this.store.clearAll();
      await this.store.reloadPreferences();
      await this.presentToast(this.translate.instant('settings.reset.success'), 'success');
    } catch (err) {
      console.error('[SettingsStateService] resetApplicationData error', err);
      await this.presentToast(this.translate.instant('settings.reset.error'), 'danger');
    } finally {
      this.isResettingData.set(false);
    }
  }

  triggerImportPicker(fileInput: HTMLInputElement | null): void {
    if (!fileInput || this.isImportingData()) {
      return;
    }
    fileInput.value = '';
    fileInput.click();
  }

  async exportDataBackup(): Promise<void> {
    if (typeof document === 'undefined') {
      await this.presentToast(this.translate.instant('settings.export.unavailable'), 'warning');
      return;
    }

    this.isExportingData.set(true);
    try {
      const docs = (await this.store.allDocs()).filter(doc => !doc._id.startsWith('_design/'));
      const json = JSON.stringify(docs, null, 2);
      const filename = buildExportFileName(new Date());
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });

      const sharedViaWeb = await this.tryShareFile(file);
      if (sharedViaWeb) {
        await this.presentToast(this.translate.instant('settings.export.readyToShare'), 'success');
        return;
      }

      const sharedViaNative = await this.shareNativeExport(json, filename);
      if (sharedViaNative) {
        await this.presentToast(this.translate.instant('settings.export.readyToShare'), 'success');
        return;
      }

      this.triggerDownload(blob, filename);
      await this.presentToast(this.translate.instant('settings.export.success'), 'success');
    } catch (err) {
      console.error('[SettingsStateService] exportDataBackup error', err);
      await this.presentToast(this.translate.instant('settings.export.error'), 'danger');
    } finally {
      this.isExportingData.set(false);
    }
  }

  async handleImportFileSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }

    const confirmed = await this.confirmImport();
    if (!confirmed) {
      return;
    }

    this.isImportingData.set(true);
    try {
      const fileContents = await file.text();
      const docs = parseBackup(fileContents, new Date().toISOString());
      await this.applyImport(docs);
    } catch (err: any) {
      console.error('[SettingsStateService] handleImportFileSelection error', err);
      const messageKey =
        err?.message === IMPORT_EMPTY_ERROR
          ? 'settings.import.empty'
          : err?.message === IMPORT_EMPTY_INVALID
            ? 'settings.import.invalid'
            : 'settings.import.error';
      await this.presentToast(this.translate.instant(messageKey), 'danger');
    } finally {
      this.isImportingData.set(false);
    }
  }

  async updateThemePreference(value: string | number | null | undefined): Promise<void> {
    const normalized = typeof value === 'string' ? value : value != null ? String(value) : null;
    const nextTheme: AppThemePreference = normalized === 'light' || normalized === 'dark' ? normalized : 'system';

    if (nextTheme === this.themePreference()) {
      return;
    }

    this.isUpdatingTheme.set(true);
    try {
      const current = this.store.getPreferencesSnapshot();
      await this.store.savePreferences({
        ...current,
        theme: nextTheme,
      });
    } catch (err) {
      console.error('[SettingsStateService] updateThemePreference error', err);
      await this.presentToast(this.translate.instant('settings.appearance.error'), 'danger');
    } finally {
      this.isUpdatingTheme.set(false);
    }
  }

  navigateToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }

  private async ensurePreferencesLoaded(): Promise<void> {
    try {
      await this.store.getPreferences();
    } catch (err) {
      console.error('[SettingsStateService] ensurePreferencesLoaded error', err);
      await this.presentToast(this.translate.instant('settings.loadError'), 'danger');
    }
  }

  private async confirmImport(): Promise<boolean> {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.confirm(this.translate.instant('settings.import.confirm'));
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
      console.warn('[SettingsStateService] Web Share failed, falling back to download', err);
      return false;
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'medium'): Promise<void> {
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

  private async shareNativeExport(json: string, filename: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const path = `${EXPORT_PATH}/${filename}`;
      await Filesystem.writeFile({
        path,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      try {
        const uri = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({
          title: this.translate.instant('settings.export.shareTitle'),
          text: this.translate.instant('settings.export.shareText'),
          url: uri.uri,
        });
        return true;
      } catch (shareErr) {
        console.warn('[SettingsStateService] Native share failed', shareErr);
        return false;
      } finally {
        try {
          await Filesystem.deleteFile({ path, directory: Directory.Cache });
        } catch (deleteErr) {
          console.warn('[SettingsStateService] Failed to delete temp export file', deleteErr);
        }
      }
    } catch (err) {
      console.warn('[SettingsStateService] Native export unavailable', err);
      return false;
    }
  }

  private async applyImport(docs: BaseDoc[]): Promise<void> {
    await this.store.clearAll();
    await this.store.bulkSave(docs);
    await this.store.reloadPreferences();
    await this.presentToast(this.translate.instant('settings.import.success'), 'success');
    if (typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 300);
    }
  }
}
