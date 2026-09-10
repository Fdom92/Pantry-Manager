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

  /**
   * Confirmation with more than one way to say yes.
   *
   * Some destructive actions are destructive only because the app offered no
   * better verb. Deleting a product that still has stock is the case that
   * prompted this: the user means "I finished it", the app hears "erase it",
   * and the consumption history goes with it.
   *
   * Returns the chosen role, or `'cancel'` for the cancel button, a backdrop
   * tap or a hardware back press.
   */
  async choose<T extends string>(
    message: string,
    opts: { header?: string; choices: readonly ChoiceOption<T>[] },
  ): Promise<T | 'cancel'> {
    const alert = await this.alertCtrl.create({
      header: opts.header,
      message,
      buttons: [
        ...opts.choices.map(choice => ({
          text: this.translate.instant(choice.labelKey),
          role: choice.role,
          cssClass: choice.danger ? 'alert-button-danger' : undefined,
        })),
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    // Ionic reports 'backdrop' for a backdrop tap; anything that is not one of
    // our own roles means the user backed out.
    const chosen = opts.choices.find(choice => choice.role === role);
    return chosen ? chosen.role : 'cancel';
  }
}

export interface ChoiceOption<T extends string> {
  /** Value returned when this button is picked. Must not be `'cancel'`. */
  role: T;
  labelKey: string;
  danger?: boolean;
}
