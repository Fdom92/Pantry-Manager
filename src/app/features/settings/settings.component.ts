import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { BACKUP_FILENAME, EXPORT_PATH, IMPORT_EMPTY_ERROR, IMPORT_EMPTY_INVALID, TOAST_DURATION } from '@core/constants';
import { AppThemePreference } from '@core/models';
import { BaseDoc } from '@core/models/shared';
import { AppPreferencesService, StorageService } from '@core/services';
import { RevenuecatService } from '@core/services/upgrade';
import { NavController, ToastController } from '@ionic/angular';
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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProBannerComponent } from '@shared/components/pro-banner/pro-banner.component';
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
    ProBannerComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent {
  // DI
  private readonly toastCtrl = inject(ToastController);
  private readonly appPreferencesService = inject(AppPreferencesService);
  private readonly storage = inject<StorageService<BaseDoc>>(StorageService);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  // Data
  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isPro$ = this.revenuecat.isPro$;
  // Signals
  readonly isExportingData = signal(false);
  readonly isImportingData = signal(false);
  readonly isResettingData = signal(false);
  readonly isUpdatingTheme = signal(false);
  // Computed Signals
  readonly themePreference = computed<AppThemePreference>(() => this.appPreferencesService.preferences().theme);

  async ionViewWillEnter(): Promise<void> {
    await this.ensurePreferencesLoaded();
  }

  async resetApplicationData(): Promise<void> {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            this.translate.instant('settings.reset.confirm')
          );

    if (!confirmed) {
      return;
    }

    this.isResettingData.set(true);
    try {
      await this.storage.clearAll();
      await this.appPreferencesService.reload();
      await this.presentToast(this.translate.instant('settings.reset.success'), 'success');
    } catch (err) {
      console.error('[SettingsComponent] onResetApp error', err);
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
      const docs = (await this.storage.all()).filter(doc => !doc._id.startsWith('_design/'));
      const json = JSON.stringify(docs, null, 2);
      const filename = this.buildExportFileName();
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
      console.error('[SettingsComponent] onExportData error', err);
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
      const docs = this.parseBackup(fileContents);
      await this.applyImport(docs);
    } catch (err: any) {
      console.error('[SettingsComponent] onImportData error', err);
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
    const nextTheme: AppThemePreference =
      normalized === 'light' || normalized === 'dark'
        ? normalized
        : 'system';

    if (nextTheme === this.themePreference()) {
      return;
    }

    this.isUpdatingTheme.set(true);
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
      this.isUpdatingTheme.set(false);
    }
  }

  navigateToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }

  private async ensurePreferencesLoaded(): Promise<void> {
    try {
      await this.appPreferencesService.getPreferences();
    } catch (err) {
      console.error('[SettingsComponent] ensurePreferencesLoaded error', err);
      await this.presentToast(this.translate.instant('settings.loadError'), 'danger');
    }
  }

  private parseBackup(raw: string): BaseDoc[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(IMPORT_EMPTY_INVALID);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(IMPORT_EMPTY_INVALID);
    }

    const now = new Date().toISOString();
    const docs = parsed
      .filter(entry => !!entry && typeof entry === 'object')
      .map(entry => entry as any)
      .filter(doc => typeof doc._id === 'string' && doc._id.trim().length > 0)
      .filter(doc => typeof doc.type === 'string' && doc.type.trim().length > 0)
      .filter(doc => !String(doc._id).startsWith('_design/'))
      .filter(doc => doc._deleted !== true)
      .map(doc => {
        const sanitizedId = doc._id.trim();
        const sanitizedType = doc.type.trim();
        const createdAt = typeof doc.createdAt === 'string' && doc.createdAt ? doc.createdAt : now;
        const updatedAt = typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : createdAt;
        const { _rev, _revisions, _conflicts, _deleted, ...rest } = doc;
        return {
          ...rest,
          _id: sanitizedId,
          type: sanitizedType,
          createdAt,
          updatedAt,
        } as BaseDoc;
      });

    if (!docs.length) {
      throw new Error(IMPORT_EMPTY_ERROR);
    }
    return docs;
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

  private buildExportFileName(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');
    return `${BACKUP_FILENAME}-${timestamp}.json`;
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
        console.warn('[SettingsComponent] Native share failed', shareErr);
        return false;
      } finally {
        try {
          await Filesystem.deleteFile({ path, directory: Directory.Cache });
        } catch (deleteErr) {
          console.warn('[SettingsComponent] Failed to delete temp export file', deleteErr);
        }
      }
    } catch (err) {
      console.warn('[SettingsComponent] Native export unavailable', err);
      return false;
    }
  }

  private async applyImport(docs: BaseDoc[]): Promise<void> {
    await this.storage.clearAll();
    await this.storage.bulkSave(docs);
    await this.appPreferencesService.reload();
    await this.presentToast(this.translate.instant('settings.import.success'), 'success');
    if (typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 300);
    }
  }
}
