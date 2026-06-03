import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_NOTIFICATION_HOUR,
  NOTIFICATION_IDS,
  RECOVERY_NOTIFICATION_IDS,
  RECOVERY_OFFSETS_DAYS,
  type RecoverySlot,
} from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';

const SLOT_ID: Record<RecoverySlot, number> = {
  d2: NOTIFICATION_IDS.RECOVERY_D2,
  d5: NOTIFICATION_IDS.RECOVERY_D5,
  d10: NOTIFICATION_IDS.RECOVERY_D10,
};

const SLOT_KEY: Record<RecoverySlot, { title: string; body: string }> = {
  d2: {
    title: 'notifications.recovery.d2.title',
    body: 'notifications.recovery.d2.body',
  },
  d5: {
    title: 'notifications.recovery.d5.title',
    body: 'notifications.recovery.d5.body',
  },
  d10: {
    title: 'notifications.recovery.d10.title',
    body: 'notifications.recovery.d10.body',
  },
};

@Injectable({ providedIn: 'root' })
export class RecoveryNotificationsService {
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly translate = inject(TranslateService);
  private readonly preferences = inject(SettingsPreferencesService);

  /**
   * Schedule the three-slot recovery window. Cancels any existing slots first
   * so re-running this on a re-installed / re-onboarded user stays idempotent.
   */
  async scheduleRecoveryWindow(): Promise<void> {
    await this.cancelRecoveryWindow();

    const hour = this.preferences.preferences().notificationHour ?? DEFAULT_NOTIFICATION_HOUR;
    const slots: RecoverySlot[] = ['d2', 'd5', 'd10'];

    const payload = slots.map((slot, idx) => {
      const offsetDays = RECOVERY_OFFSETS_DAYS[idx];
      const trigger = new Date();
      trigger.setDate(trigger.getDate() + offsetDays);
      trigger.setHours(hour, 0, 0, 0);
      return {
        id: SLOT_ID[slot],
        title: this.translate.instant(SLOT_KEY[slot].title),
        body: this.translate.instant(SLOT_KEY[slot].body),
        scheduleAt: trigger,
      };
    });

    await this.plugin.schedule(payload);
  }

  /** Cancel all pending recovery slots. Safe to call even when nothing is scheduled. */
  async cancelRecoveryWindow(): Promise<void> {
    await this.plugin.cancel([...RECOVERY_NOTIFICATION_IDS]);
  }

  /**
   * Dev-only: fire a single recovery slot in `delayMs` milliseconds. Does NOT
   * affect the real D2/D5/D10 window — only schedules an extra one-off.
   */
  async fireRecoveryNotification(slot: RecoverySlot, opts?: { delayMs?: number }): Promise<void> {
    const delay = opts?.delayMs ?? 5_000;
    await this.plugin.schedule([
      {
        id: SLOT_ID[slot],
        title: this.translate.instant(SLOT_KEY[slot].title),
        body: this.translate.instant(SLOT_KEY[slot].body),
        scheduleAt: new Date(Date.now() + delay),
      },
    ]);
  }
}
