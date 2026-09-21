import { Injectable, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { LoggerService } from './logger.service';

export interface ToastOptions {
  duration?: number;
  position?: 'top' | 'bottom';
  color?: string;
}

const DURATION = {
  success: 1500,
  info: 2000,
  error: 3000,
  action: 5000,
} as const;

/**
 * Single presentation point for toasts. Takes an i18n key, not a string:
 * every call site used to repeat `translate.instant` right before creating
 * the toast. Durations are fixed per intent — six different values had crept
 * in across 23 hand-rolled call sites.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);
  private readonly logger = inject(LoggerService);

  /**
   * The toast currently on screen, if any. Only one is ever shown at a time:
   * without this, a second toast (e.g. "Añadido a la lista" right after
   * "Comprado") stacked on top of the first and could cover the footer of an
   * open sheet.
   */
  private current: HTMLIonToastElement | null = null;

  success(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), { duration: DURATION.success });
  }

  info(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), { duration: DURATION.info });
  }

  error(key: string, params?: Record<string, unknown>): void {
    void this.present(this.translate.instant(key, params), {
      duration: DURATION.error,
      color: 'danger',
    });
  }

  /** For messages already built by the caller (concatenations, dev panels). */
  raw(message: string, opts?: ToastOptions): void {
    void this.present(message, opts);
  }

  /**
   * A toast with one action button (e.g. "Undo"). Longer than the others:
   * the user has to read it and decide.
   */
  withAction(
    key: string,
    actionKey: string,
    onAction: () => void,
    params?: Record<string, unknown>,
  ): void {
    void this.presentWithAction(
      this.translate.instant(key, params),
      this.translate.instant(actionKey),
      onAction,
    );
  }

  private async presentWithAction(message: string, actionText: string, onAction: () => void): Promise<void> {
    try {
      const position = await this.resolvePosition();
      await this.dismissCurrent();
      const toast = await this.toastCtrl.create({
        message,
        duration: DURATION.action,
        position,
        buttons: [{ text: actionText, handler: () => { onAction(); } }],
      });
      this.trackCurrent(toast);
      await toast.present();
    } catch (err) {
      this.logger.warn('ToastService', 'Failed to present action toast', { err: String(err) });
    }
  }

  private async present(message: string, opts?: ToastOptions): Promise<void> {
    try {
      const position = opts?.position ?? await this.resolvePosition();
      await this.dismissCurrent();
      const toast = await this.toastCtrl.create({
        message,
        duration: opts?.duration ?? DURATION.info,
        position,
        ...(opts?.color ? { color: opts.color } : {}),
      });
      this.trackCurrent(toast);
      await toast.present();
    } catch (err) {
      this.logger.warn('ToastService', 'Failed to present toast', { err: String(err) });
    }
  }

  /** Toasts default to the bottom, but that is where an open sheet's footer
   *  (e.g. the buy sheet's "Añadir" button) lives, so they surface at the top
   *  instead whenever a modal is in front. */
  private async resolvePosition(): Promise<'top' | 'bottom'> {
    const topModal = await this.modalCtrl.getTop();
    return topModal ? 'top' : 'bottom';
  }

  private async dismissCurrent(): Promise<void> {
    await this.current?.dismiss().catch(() => undefined);
  }

  private trackCurrent(toast: HTMLIonToastElement): void {
    this.current = toast;
    void toast.onDidDismiss().then(() => {
      if (this.current === toast) {
        this.current = null;
      }
    });
  }
}
