import { Injectable, inject } from '@angular/core';
import { TOAST_DURATION } from '@core/constants';
import { ToastController } from '@ionic/angular';

export type ToastPosition = 'top' | 'bottom' | 'middle';

export interface ToastOptions {
  color?: string;
  duration?: number;
  position?: ToastPosition;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);

  async present(message: string, options: ToastOptions = {}): Promise<void> {
    if (!message) {
      return;
    }

    const toast = await this.toastCtrl.create({
      message,
      color: options.color,
      duration: options.duration ?? TOAST_DURATION,
      position: options.position ?? 'bottom',
    });
    await toast.present();
  }
}

