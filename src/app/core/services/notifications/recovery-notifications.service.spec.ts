import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_NOTIFICATION_HOUR,
  NOTIFICATION_IDS,
  RECOVERY_NOTIFICATION_IDS,
  RECOVERY_OFFSETS_DAYS,
} from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { RecoveryNotificationsService } from './recovery-notifications.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';

class FakePlugin {
  scheduled: Array<{ id: number; title: string; body: string; scheduleAt: Date }> = [];
  cancelled: number[][] = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (notifs: any[]) => {
    this.scheduled.push(...notifs);
  });
  cancel = jasmine.createSpy('cancel').and.callFake(async (ids: number[]) => {
    this.cancelled.push(ids);
  });
}

class FakeTranslate {
  instant(key: string): string { return `[${key}]`; }
}

class FakePrefs {
  preferences = () => ({ notificationHour: DEFAULT_NOTIFICATION_HOUR });
}

describe('RecoveryNotificationsService', () => {
  let service: RecoveryNotificationsService;
  let plugin: FakePlugin;

  beforeEach(() => {
    plugin = new FakePlugin();
    TestBed.configureTestingModule({
      providers: [
        RecoveryNotificationsService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: TranslateService, useClass: FakeTranslate },
        { provide: SettingsPreferencesService, useClass: FakePrefs },
      ],
    });
    service = TestBed.inject(RecoveryNotificationsService);
  });

  it('schedules three notifs at D2 / D5 / D10 with the configured hour', async () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    jasmine.clock().install();
    jasmine.clock().mockDate(now);

    await service.scheduleRecoveryWindow();

    expect(plugin.scheduled.length).toBe(3);
    const ids = plugin.scheduled.map(n => n.id).sort();
    expect(ids).toEqual([...RECOVERY_NOTIFICATION_IDS].sort());

    plugin.scheduled.forEach(n => {
      expect(n.scheduleAt.getHours()).toBe(DEFAULT_NOTIFICATION_HOUR);
    });

    const dayOffsets = plugin.scheduled
      .map(n => Math.round((n.scheduleAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      .sort((a, b) => a - b);
    expect(dayOffsets).toEqual([...RECOVERY_OFFSETS_DAYS]);

    jasmine.clock().uninstall();
  });

  it('cancels all three ids on cancelRecoveryWindow', async () => {
    await service.cancelRecoveryWindow();
    expect(plugin.cancel).toHaveBeenCalledWith([...RECOVERY_NOTIFICATION_IDS]);
  });

  it('cancels before re-scheduling to keep slots idempotent', async () => {
    await service.scheduleRecoveryWindow();
    expect(plugin.cancel).toHaveBeenCalledWith([...RECOVERY_NOTIFICATION_IDS]);
    expect(plugin.cancel.calls.count()).toBeGreaterThanOrEqual(1);
  });

  it('fireRecoveryNotification fires a single slot at now + delayMs', async () => {
    const before = Date.now();
    await service.fireRecoveryNotification('d5', { delayMs: 5_000 });
    expect(plugin.scheduled.length).toBe(1);
    const n = plugin.scheduled[0];
    expect(n.id).toBe(NOTIFICATION_IDS.RECOVERY_D5);
    const ts = n.scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + 5_000 - 50);
    expect(ts).toBeLessThanOrEqual(before + 5_000 + 200);
  });
});
