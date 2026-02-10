import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { buildExportFileName, parseBackup } from '@core/domain/settings';
import type { AppThemePreference } from '@core/models';
import type { BaseDoc } from '@core/models/shared';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService, DownloadService, ShareService, createLatestOnlyRunner, withSignalFlag } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { StorageService } from '../shared/storage.service';
import { RevenuecatService } from '../upgrade/revenuecat.service';
import { AppPreferencesService } from './app-preferences.service';
import { PantryMigrationService } from '../migration/pantry-migration.service';
import { EventManagerService } from '../events';
import type { PantryItem } from '@core/models/pantry';
import { sumQuantities } from '@core/domain/pantry/pantry-stock/pantry-stock';

@Injectable()
export class SettingsStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifecycle = createLatestOnlyRunner(this.destroyRef);
  private readonly translate = inject(TranslateService);
  private readonly storage = inject<StorageService<BaseDoc>>(StorageService);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly migrationService = inject(PantryMigrationService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly eventManager = inject(EventManagerService);
  private readonly navCtrl = inject(NavController);
  private readonly download = inject(DownloadService);
  private readonly confirm = inject(ConfirmService);
  private readonly share = inject(ShareService);
  private readonly reviewPrompt = inject(ReviewPromptService);

  readonly isPro$ = this.revenuecat.isPro$;
  readonly themePreference = computed(() => this.appPreferences.preferences().theme);

  readonly isExportingData = signal(false);
  readonly isImportingData = signal(false);
  readonly isResettingData = signal(false);
  readonly isUpdatingTheme = signal(false);

  async ionViewWillEnter(): Promise<void> {
    await this.ensurePreferencesLoaded();
  }

  async resetApplicationData(): Promise<void> {
    const confirmed = this.confirm.confirm(this.translate.instant('settings.reset.confirm'));

    if (!confirmed) {
      return;
    }

    await withSignalFlag(this.isResettingData, async () => {
      await this.storage.clearAll();
      await this.appPreferences.reload();
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      this.reloadApp();
    }).catch(async err => {
      console.error('[SettingsStateService] resetApplicationData error', err);
    });
  }

  openImportPicker(fileInput: HTMLInputElement | null): void {
    if (!fileInput || this.isImportingData()) {
      return;
    }
    fileInput.value = '';
    fileInput.click();
  }

  async exportDataBackup(): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    if (this.isExportingData()) {
      return;
    }

    await withSignalFlag(this.isExportingData, async () => {
      const docs = (await this.storage.all()).filter(doc => !doc._id.startsWith('_design/'));
      const json = JSON.stringify(docs, null, 2);
      const filename = buildExportFileName(new Date());
      const blob = new Blob([json], { type: 'application/json' });

      const { outcome } = await this.share.tryShareBlob({
        blob,
        filename,
        mimeType: 'application/json',
        title: this.translate.instant('settings.export.shareTitle'),
        text: this.translate.instant('settings.export.shareText'),
      });

      if (this.lifecycle.isDestroyed()) {
        return;
      }

      if (outcome === 'shared') {
        return;
      }

      if (outcome === 'cancelled') {
        return;
      }

      this.download.downloadBlob(blob, filename);
    }).catch(async err => {
      console.error('[SettingsStateService] exportDataBackup error', err);
    });
  }

  async submitImportFileSelection(event: Event): Promise<void> {
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

    let shouldReload = false;

    await withSignalFlag(this.isImportingData, async () => {
      const fileContents = await file.text();
      const docs = parseBackup(fileContents, new Date().toISOString());
      await this.applyImport(docs);
      this.reviewPrompt.markEngagement();
      if (!this.lifecycle.isDestroyed()) {
        shouldReload = true;
      }
    }).catch(async (err: any) => {
      console.error('[SettingsStateService] submitImportFileSelection error', err);
      if (this.lifecycle.isDestroyed()) {
        return;
      }
    });

    if (shouldReload && typeof window !== 'undefined') {
      this.reloadApp();
    }
  }

  async updateThemePreference(value: string | number | null | undefined): Promise<void> {
    const normalized = typeof value === 'string' ? value : value != null ? String(value) : null;
    const nextTheme: AppThemePreference = normalized === 'light' || normalized === 'dark' ? normalized : 'system';

    if (nextTheme === this.themePreference()) {
      return;
    }

    await withSignalFlag(this.isUpdatingTheme, async () => {
      const current = this.appPreferences.preferences();
      await this.appPreferences.savePreferences({
        ...current,
        theme: nextTheme,
      });
    }).catch(async err => {
      console.error('[SettingsStateService] updateThemePreference error', err);
    });
  }

  navigateToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }

  private async ensurePreferencesLoaded(): Promise<void> {
    try {
      await this.appPreferences.getPreferences();
    } catch (err) {
      console.error('[SettingsStateService] ensurePreferencesLoaded error', err);
    }
  }

  private async confirmImport(): Promise<boolean> {
    return this.confirm.confirm(this.translate.instant('settings.import.confirm'));
  }

  private async applyImport(docs: BaseDoc[]): Promise<void> {
    await this.storage.clearAll();
    await this.storage.bulkSave(docs);
    await this.logImportEventsIfNeeded(docs);
    await this.appPreferences.reload();
    this.migrationService.markMigrationCheckNeeded();
    if (this.lifecycle.isDestroyed()) {
      return;
    }
  }

  private async logImportEventsIfNeeded(docs: BaseDoc[]): Promise<void> {
    const items = docs.filter(doc => doc.type === 'item') as PantryItem[];
    if (!items.length) {
      return;
    }
    const totalItems = items.length;
    await this.eventManager.logImportGlobal(totalItems);
  }

  private reloadApp(): void {
    if (typeof window === 'undefined') {
      return;
    }
    setTimeout(() => window.location.reload(), 600);
  }
}
