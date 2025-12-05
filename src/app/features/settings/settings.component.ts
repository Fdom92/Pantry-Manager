import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AppThemePreference, BaseDoc } from '@core/models';
import { AppPreferencesService, StorageService } from '@core/services';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProBannerComponent } from '@features/shared/pro-banner/pro-banner.component';
import packageJson from '../../../../package.json';

const TOAST_DURATION = 1800;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, TranslateModule, ProBannerComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent {
  readonly appVersion = packageJson.version ?? '0.0.0';

  readonly exportingData = signal(false);
  readonly importingData = signal(false);
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

  triggerImport(fileInput: HTMLInputElement | null): void {
    if (!fileInput || this.importingData()) {
      return;
    }
    this.tryNativeAutoImport(fileInput);
  }

  private async tryNativeAutoImport(fileInput: HTMLInputElement): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      fileInput.value = '';
      fileInput.click();
      return;
    }

    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const folder = 'PantryManager';
      const listing = await Filesystem.readdir({ path: folder, directory: Directory.Documents });
      const candidates = listing.files?.filter(file => file.name?.toLowerCase().endsWith('.json')) ?? [];
      if (!candidates.length) {
        fileInput.value = '';
        fileInput.click();
        return;
      }

      const filesWithStats = await Promise.all(
        candidates.map(async file => {
          try {
            const path = `${folder}/${file.name}`;
            const stat = await Filesystem.stat({ path, directory: Directory.Documents });
            return { path, mtime: stat.mtime ?? 0 };
          } catch {
            return null;
          }
        })
      );
      const usable = filesWithStats.filter((f): f is { path: string; mtime: number } => !!f);
      if (!usable.length) {
        fileInput.value = '';
        fileInput.click();
        return;
      }

      const latest = usable.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))[0];
      const confirmed = await this.confirmImport();
      if (!confirmed) {
        return;
      }

      this.importingData.set(true);
      try {
        const file = await Filesystem.readFile({
          path: latest.path,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        const payload =
          typeof file.data === 'string'
            ? file.data
            : file.data instanceof Blob
              ? await file.data.text()
              : '';
        const docs = this.parseBackup(payload ?? '');
        await this.applyImport(docs);
      } catch (err) {
        console.error('[SettingsComponent] tryNativeAutoImport error', err);
        await this.presentToast(this.translate.instant('settings.import.error'), 'danger');
      } finally {
        this.importingData.set(false);
      }
    } catch (err) {
      console.warn('[SettingsComponent] Native auto-import unavailable, falling back to picker', err);
      fileInput.value = '';
      fileInput.click();
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
      const filename = this.buildExportFileName();

      const nativeResult = await this.tryNativeExport(json, filename);
      if (!nativeResult?.success) {
        const blob = new Blob([json], { type: 'application/json' });
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
      } else {
        const message = nativeResult.shared
          ? this.translate.instant('settings.export.readyToShare')
          : this.translate.instant('settings.export.saved', { path: nativeResult.path ?? '' });
        await this.presentToast(message, 'success');
      }
    } catch (err) {
      console.error('[SettingsComponent] onExportData error', err);
      await this.presentToast(this.translate.instant('settings.export.error'), 'danger');
    } finally {
      this.exportingData.set(false);
    }
  }

  private async tryNativeExport(
    json: string,
    filename: string
  ): Promise<{ success: true; shared: boolean; path?: string } | null> {
    if (!Capacitor.isNativePlatform()) {
      return null;
    }
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const path = `PantryManager/${filename}`;
      await Filesystem.writeFile({
        path,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      const uri = await Filesystem.getUri({ path, directory: Directory.Documents });
      let shared = false;
      try {
        await Share.share({
          title: this.translate.instant('settings.export.shareTitle'),
          text: this.translate.instant('settings.export.shareText'),
          url: uri.uri,
        });
        shared = true;
      } catch (shareErr) {
        console.warn('[SettingsComponent] Native share failed, keeping file on device', shareErr);
      }
      return { success: true, shared, path: uri.uri };
    } catch (err) {
      console.warn('[SettingsComponent] Native export unavailable', err);
      return null;
    }
  }

  async onImportFileSelected(event: Event): Promise<void> {
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

    this.importingData.set(true);
    try {
      const fileContents = await file.text();
      const docs = this.parseBackup(fileContents);
      await this.applyImport(docs);
    } catch (err: any) {
      console.error('[SettingsComponent] onImportData error', err);
      const messageKey =
        err?.message === 'IMPORT_EMPTY'
          ? 'settings.import.empty'
          : err?.message === 'IMPORT_INVALID'
            ? 'settings.import.invalid'
            : 'settings.import.error';
      await this.presentToast(this.translate.instant(messageKey), 'danger');
    } finally {
      this.importingData.set(false);
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

  private parseBackup(raw: string): BaseDoc[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('IMPORT_INVALID');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('IMPORT_INVALID');
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
      throw new Error('IMPORT_EMPTY');
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

  goToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }

  private ensureProAccess(): boolean {
    if (this.revenuecat.isPro()) {
      return true;
    }
    void this.navCtrl.navigateForward('/upgrade');
    return false;
  }
}
