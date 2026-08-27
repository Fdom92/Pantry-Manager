import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';

/**
 * Dev-panel only. Loaded with a dynamic import so it never reaches the initial
 * production bundle. Holds what used to be four "Dev-only" methods inside
 * NotificationSchedulerService.
 */
@Injectable({ providedIn: 'root' })
export class DevNotificationsService {
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);

  /** Evaluate without scheduling. Returns null when nothing would be sent. */
  previewNext(): { title: string; body: string } | null {
    const winner = this.scheduler.evaluateWinnerNow(new Date());
    return winner ? { title: winner.title, body: winner.body } : null;
  }

  /**
   * Fire the winning notification at `at`. Replaces the old pair
   * scheduleTestNotification (now + 5s) / scheduleNotificationAtTime (hh:mm).
   * Besides the target date, this also differs from both originals in that it
   * forwards the winner's `extra` payload to the plugin, so dev-fired
   * notifications carry the same deep-link data a real one would.
   */
  async fireWinning(at: Date): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (!(await this.ensurePermission())) return false;

    const winner = this.scheduler.evaluateWinnerNow(new Date());
    if (!winner) return false;

    await this.plugin.schedule([{
      id: winner.id,
      title: winner.title,
      body: winner.body,
      scheduleAt: at,
      extra: winner.extra,
    }]);
    return true;
  }

  /** Fire one specific definition regardless of priority, in ~5 seconds. */
  async fireDefinition(definitionId: number): Promise<boolean> {
    if (!(await this.ensurePermission())) return false;

    const payload = this.scheduler.evaluateDefinitionNow(definitionId, new Date());
    if (!payload) return false;

    await this.plugin.schedule([{
      id: payload.id,
      title: payload.title,
      body: payload.body,
      scheduleAt: new Date(Date.now() + 5_000),
      extra: payload.extra,
    }]);
    return true;
  }

  private async ensurePermission(): Promise<boolean> {
    await this.permission.init();
    if (this.permission.isGranted()) return true;
    return await this.permission.request();
  }
}
