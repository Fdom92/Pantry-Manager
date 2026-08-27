import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

export interface ConfirmOptions {
  /** i18n key for the confirming button. Defaults to `common.actions.confirm`. */
  confirmKey?: string;
  header?: string;
}

/**
 * Confirmation dialog for destructive flows. Uses Ionic's AlertController —
 * `window.confirm` renders a browser dialog inside the app and blocks the
 * WebView thread while it is open.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  async confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header: opts?.header,
      message,
      buttons: [
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
        { text: this.translate.instant(opts?.confirmKey ?? 'common.actions.confirm'), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
