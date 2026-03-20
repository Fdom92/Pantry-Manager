import { Injectable, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { Filesystem, Encoding } from '@capacitor/filesystem';
import { parseBackup, buildExportFileName } from '@core/domain/settings';
import { IMPORT_EMPTY_ERROR, IMPORT_INVALID_ERROR } from '@core/constants';
import type { BaseDoc } from '@core/models/shared';
import { StorageService } from '../shared/storage.service';
import { ShareService } from '../shared/share.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { MigrationPantryService } from '../migration/migration-pantry.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly storage = inject<StorageService<BaseDoc>>(StorageService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly migrationService = inject(MigrationPantryService);
  private readonly share = inject(ShareService);
  private readonly translate = inject(TranslateService);
  private readonly alertCtrl = inject(AlertController);

  readonly isSendingSync = signal(false);
  readonly isApplyingSync = signal(false);

  // Called from AppComponent when the app receives a file intent
  async handleIncomingIntent(url: string): Promise<void> {
    // Validate the file BEFORE asking the user — avoids confusing errors after confirmation
    let docs: BaseDoc[];
    try {
      const result = await Filesystem.readFile({ path: url, encoding: Encoding.UTF8 });
      const text = result.data as string;
      docs = parseBackup(text, new Date().toISOString());
    } catch (err) {
      console.error('[SyncService] handleIncomingIntent: invalid file', err);
      await this.showSyncError(err);
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.translate.instant('sync.incoming.title'),
      message: this.translate.instant('sync.incoming.message'),
      buttons: [
        {
          text: this.translate.instant('sync.incoming.dismiss'),
          role: 'cancel',
        },
        {
          text: this.translate.instant('sync.incoming.confirm'),
          handler: () => {
            void this.doApplyImport(docs);
          },
        },
      ],
    });
    await alert.present();
  }

  async sendSync(): Promise<void> {
    if (this.isSendingSync()) return;
    this.isSendingSync.set(true);
    try {
      const docs = (await this.storage.all()).filter(doc => !doc._id.startsWith('_design/'));
      const json = JSON.stringify(docs, null, 2);
      const filename = buildExportFileName(new Date());
      const blob = new Blob([json], { type: 'application/json' });
      await this.share.tryShareBlob({
        blob,
        filename,
        mimeType: 'application/json',
        title: this.translate.instant('sync.send.shareTitle'),
        text: this.translate.instant('sync.send.shareText'),
      });
    } catch (err) {
      console.error('[SyncService] sendSync error', err);
    } finally {
      this.isSendingSync.set(false);
    }
  }

  // Extracted from SettingsStateService — shared by backup import and sync
  async applyImport(docs: BaseDoc[]): Promise<void> {
    await this.storage.clearAll();
    await this.storage.bulkSave(docs);
    await this.appPreferences.reload();
    this.migrationService.markMigrationCheckNeeded();
  }

  private async doApplyImport(docs: BaseDoc[]): Promise<void> {
    if (this.isApplyingSync()) return;
    this.isApplyingSync.set(true);
    try {
      await this.applyImport(docs);
      sessionStorage.setItem('sync:postReload', '1');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error('[SyncService] doApplyImport error', err);
      await this.showSyncError(err);
    } finally {
      this.isApplyingSync.set(false);
    }
  }

  private async showSyncError(err: unknown): Promise<void> {
    const msgKey =
      err instanceof Error && err.message === IMPORT_EMPTY_ERROR
        ? 'settings.import.empty'
        : err instanceof Error && err.message === IMPORT_INVALID_ERROR
          ? 'settings.import.invalid'
          : 'settings.import.error';
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('sync.incoming.errorTitle'),
      message: this.translate.instant(msgKey),
      buttons: [this.translate.instant('common.actions.close')],
    });
    await alert.present();
  }
}
