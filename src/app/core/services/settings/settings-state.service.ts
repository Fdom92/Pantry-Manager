import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { buildExportFileName, parseBackup } from '@core/domain/settings';
import type { AppThemePreference } from '@core/models';
import type { BaseDoc } from '@core/models/shared';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { createLatestOnlyRunner, runIfIdle } from '@core/utils';
import { ANALYTICS_EVENTS, type SupportedLanguage } from '@core/constants';
import { ConfirmService, DownloadService, LoggerService, ShareService, shouldSkipShareOutcome } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { StorageService } from '../shared/storage.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { LanguageService } from '../shared/language.service';
import { ToastService } from '../shared/toast.service';
import type { PurchasesOffering } from '@revenuecat/purchases-capacitor';
import { SettingsPreferencesService } from './settings-preferences.service';
import { SyncService } from '../sync/sync.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class SettingsStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifecycle = createLatestOnlyRunner(this.destroyRef);
  private readonly translate = inject(TranslateService);
  private readonly storage = inject<StorageService<BaseDoc>>(StorageService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly language = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly navCtrl = inject(NavController);
  private readonly download = inject(DownloadService);
  private readonly confirm = inject(ConfirmService);
  private readonly share = inject(ShareService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly syncService = inject(SyncService);
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);

  readonly isPro = toSignal(this.revenuecat.isPro$, {
    initialValue: this.revenuecat.isPro(),
  });
  readonly themePreference = computed(() => this.appPreferences.preferences().theme);
  readonly analyticsEnabled = computed(
    () => this.appPreferences.preferences().analyticsEnabled === true
  );
  readonly isUpdatingAnalytics = signal(false);

  readonly isExportingData = signal(false);
  readonly isImportingData = signal(false);
  readonly isResettingData = signal(false);
  readonly isUpdatingTheme = signal(false);
  readonly isReady = signal(false);

  async ionViewWillEnter(): Promise<void> {
    try {
      await this.appPreferences.getPreferences();
    } catch (err) {
      this.logger.error('SettingsStateService', 'ensurePreferencesLoaded error', err);
    }
    this.isReady.set(true);
  }

  async resetApplicationData(): Promise<void> {
    const confirmed = await this.confirm.confirm(this.translate.instant('settings.reset.confirm'));

    if (!confirmed) {
      return;
    }

    await runIfIdle(this.isResettingData, async () => {
      await this.storage.clearAll();
      await this.appPreferences.reload();
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      this.reloadApp();
    }).catch(async err => {
      this.logger.error('SettingsStateService', 'resetApplicationData error', err);
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
    await runIfIdle(this.isExportingData, async () => {
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

      if (shouldSkipShareOutcome(outcome)) {
        return;
      }

      this.download.downloadBlob(blob, filename);
    }).catch(async err => {
      this.logger.error('SettingsStateService', 'exportDataBackup error', err);
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

    const confirmed = await this.confirm.confirm(this.translate.instant('settings.import.confirm'));
    if (!confirmed) {
      return;
    }

    let shouldReload = false;

    await runIfIdle(this.isImportingData, async () => {
      const fileContents = await file.text();
      const docs = parseBackup(fileContents, new Date().toISOString());
      await this.applyImport(docs);
      this.reviewPrompt.markEngagement();
      if (!this.lifecycle.isDestroyed()) {
        shouldReload = true;
      }
    }).catch(async (err: unknown) => {
      this.logger.error('SettingsStateService', 'submitImportFileSelection error', err);
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

    await runIfIdle(this.isUpdatingTheme, async () => {
      const current = this.appPreferences.preferences();
      await this.appPreferences.savePreferences({
        ...current,
        theme: nextTheme,
      });
      this.analytics.track(ANALYTICS_EVENTS.PREFERENCE_CHANGED, {
        key: 'theme',
        value: nextTheme,
      });
    }).catch(async err => {
      this.logger.error('SettingsStateService', 'updateThemePreference error', err);
    });
  }

  // ─── Idioma ───────────────────────────────────────────────────────────────

  readonly currentLanguage = this.language.currentLanguage;

  getCurrentLocale(): string {
    return this.language.getCurrentLocale();
  }

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    await this.language.setLanguage(lang);
  }

  /** Offering behind the PRO pricing shown in the Settings hero. */
  async getOfferings(): Promise<PurchasesOffering | null> {
    return await this.revenuecat.getOfferings();
  }

  navigateToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }

  /**
   * Toggle anonymous analytics opt-in. Writes consent to preferences via
   * `AnalyticsService.optIn/optOut`, which also (de)initialises PostHog.
   */
  async toggleAnalytics(next: boolean): Promise<void> {
    if (next === this.analyticsEnabled()) {
      return;
    }
    await runIfIdle(this.isUpdatingAnalytics, async () => {
      if (next) {
        await this.analytics.optIn();
      } else {
        await this.analytics.optOut();
      }
      this.toast.success(next ? 'settings.privacy.toastEnabled' : 'settings.privacy.toastDisabled');
    }).catch(err => {
      this.logger.error('SettingsStateService', 'toggleAnalytics error', err);
    });
  }

  private async applyImport(docs: BaseDoc[]): Promise<void> {
    await this.syncService.applyImport(docs);
    if (this.lifecycle.isDestroyed()) {
      return;
    }
  }

  private reloadApp(): void {
    if (typeof window === 'undefined') {
      return;
    }
    sessionStorage.setItem('sync:postReload', '1');
    setTimeout(() => window.location.reload(), 600);
  }
}
