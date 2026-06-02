import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NOTIFICATION_IDS, WELCOME_DELAY_MS } from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';

@Injectable({ providedIn: 'root' })
export class WelcomeNotificationService {
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly translate = inject(TranslateService);

  /**
   * Schedule the post-onboarding welcome notification.
   * Default delay is WELCOME_DELAY_MS; tests / dev panel may override.
   */
  async scheduleWelcomeNotification(opts?: { delayMs?: number }): Promise<void> {
    const delay = opts?.delayMs ?? WELCOME_DELAY_MS;
    await this.plugin.schedule([
      {
        id: NOTIFICATION_IDS.WELCOME,
        title: this.translate.instant('notifications.welcome.title'),
        body: this.translate.instant('notifications.welcome.body'),
        scheduleAt: new Date(Date.now() + delay),
      },
    ]);
  }
}
