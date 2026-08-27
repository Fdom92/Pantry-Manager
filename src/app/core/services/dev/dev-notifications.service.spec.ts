import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { NOTIFICATION_IDS } from '@core/constants';
import type { ScheduledNotification } from '@core/models/notifications';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { signal } from '@angular/core';
import { DevNotificationsService } from './dev-notifications.service';

class FakePlugin {
  scheduled: any[] = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (n: any[]) => { this.scheduled.push(...n); });
  cancel = jasmine.createSpy('cancel').and.resolveTo(undefined);
}

class FakePermission {
  init = jasmine.createSpy('init').and.resolveTo();
  request = jasmine.createSpy('request').and.resolveTo(true);
  isGranted = jasmine.createSpy('isGranted').and.returnValue(true);
  isPermanentlyDenied = () => false;
  wasRequested = true;
  permissionState = signal('granted');
}

class FakeScheduler {
  evaluateWinnerNow = jasmine.createSpy('evaluateWinnerNow').and.returnValue(null);
  evaluateDefinitionNow = jasmine.createSpy('evaluateDefinitionNow').and.returnValue(null);
}

const WINNER: ScheduledNotification = {
  id: NOTIFICATION_IDS.EXPIRED_ITEMS,
  title: 'Winner title',
  body: 'Winner body',
  scheduleAt: new Date().toISOString(),
  extra: { itemId: 'abc123' },
};

describe('DevNotificationsService', () => {
  let svc: DevNotificationsService;
  let plugin: FakePlugin;
  let scheduler: FakeScheduler;
  let permission: FakePermission;

  beforeEach(() => {
    plugin = new FakePlugin();
    scheduler = new FakeScheduler();
    permission = new FakePermission();
    TestBed.configureTestingModule({
      providers: [
        DevNotificationsService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: NotificationPermissionService, useValue: permission },
        { provide: NotificationSchedulerService, useValue: scheduler },
      ],
    });
    svc = TestBed.inject(DevNotificationsService);
  });

  describe('previewNext', () => {
    it('returns title/body from the scheduler winner', () => {
      scheduler.evaluateWinnerNow.and.returnValue(WINNER);
      expect(svc.previewNext()).toEqual({ title: WINNER.title, body: WINNER.body });
    });

    it('returns null when there is no winner', () => {
      scheduler.evaluateWinnerNow.and.returnValue(null);
      expect(svc.previewNext()).toBeNull();
    });
  });

  describe('fireWinning', () => {
    let nativeSpy: jasmine.Spy;

    beforeEach(() => {
      nativeSpy = spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    });

    it('schedules the winner at the date passed in, with its extra payload', async () => {
      scheduler.evaluateWinnerNow.and.returnValue(WINNER);
      const at = new Date('2026-09-01T08:00:00');

      const ok = await svc.fireWinning(at);

      expect(ok).toBeTrue();
      expect(plugin.scheduled.length).toBe(1);
      expect(plugin.scheduled[0].id).toBe(WINNER.id);
      expect(plugin.scheduled[0].scheduleAt).toBe(at);
      expect(plugin.scheduled[0].extra).toBe(WINNER.extra);
    });

    it('returns false when there is no winner', async () => {
      scheduler.evaluateWinnerNow.and.returnValue(null);

      const ok = await svc.fireWinning(new Date());

      expect(ok).toBeFalse();
      expect(plugin.scheduled.length).toBe(0);
    });

    it('returns false when permission is refused', async () => {
      permission.isGranted.and.returnValue(false);
      permission.request.and.resolveTo(false);
      scheduler.evaluateWinnerNow.and.returnValue(WINNER);

      const ok = await svc.fireWinning(new Date());

      expect(ok).toBeFalse();
      expect(plugin.scheduled.length).toBe(0);
      expect(scheduler.evaluateWinnerNow).not.toHaveBeenCalled();
    });

    it('returns false on a non-native platform without touching permissions', async () => {
      nativeSpy.and.returnValue(false);
      scheduler.evaluateWinnerNow.and.returnValue(WINNER);

      const ok = await svc.fireWinning(new Date());

      expect(ok).toBeFalse();
      expect(permission.init).not.toHaveBeenCalled();
      expect(plugin.scheduled.length).toBe(0);
    });
  });

  describe('fireDefinition', () => {
    it('schedules the payload from evaluateDefinitionNow in ~5s, with its extra payload', async () => {
      scheduler.evaluateDefinitionNow.and.returnValue(WINNER);

      const ok = await svc.fireDefinition(NOTIFICATION_IDS.EXPIRED_ITEMS);

      expect(ok).toBeTrue();
      expect(plugin.scheduled.length).toBe(1);
      expect(plugin.scheduled[0].id).toBe(WINNER.id);
      expect(plugin.scheduled[0].extra).toBe(WINNER.extra);
      const delta = plugin.scheduled[0].scheduleAt.getTime() - Date.now();
      expect(delta).toBeGreaterThan(4_500);
      expect(delta).toBeLessThan(6_000);
    });

    it('returns false if the definition is not registered (evaluateDefinitionNow returns null)', async () => {
      scheduler.evaluateDefinitionNow.and.returnValue(null);

      const ok = await svc.fireDefinition(999_999);

      expect(ok).toBeFalse();
      expect(plugin.scheduled.length).toBe(0);
    });

    it('returns false if the definition has nothing to fire (build returns null)', async () => {
      scheduler.evaluateDefinitionNow.and.returnValue(null);

      const ok = await svc.fireDefinition(NOTIFICATION_IDS.EXPIRED_ITEMS);

      expect(ok).toBeFalse();
    });
  });
});
