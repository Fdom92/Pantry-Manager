import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
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
  private readonly translate = inject(TranslateService);
  private readonly logger = inject(LoggerService);

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
      const toast = await this.toastCtrl.create({
        message,
        duration: DURATION.action,
        position: 'bottom',
        buttons: [{ text: actionText, handler: () => { onAction(); } }],
      });
      await toast.present();
    } catch (err) {
      this.logger.warn('ToastService', 'Failed to present action toast', { err: String(err) });
    }
  }

  private async present(message: string, opts?: ToastOptions): Promise<void> {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: opts?.duration ?? DURATION.info,
        position: opts?.position ?? 'bottom',
        ...(opts?.color ? { color: opts.color } : {}),
      });
      await toast.present();
    } catch (err) {
      this.logger.warn('ToastService', 'Failed to present toast', { err: String(err) });
    }
  }
}
