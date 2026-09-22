import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../shared/logger.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { LOCAL_NOTIFICATIONS } from './local-notifications.token';

describe('CapacitorNotificationPlugin', () => {
  let plugin: CapacitorNotificationPlugin;
  let native: jasmine.SpyObj<any>;
  let logger: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    native = jasmine.createSpyObj('LocalNotifications', [
      'checkPermissions', 'requestPermissions', 'getDeliveredNotifications',
    ]);
    logger = jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug']);
    TestBed.configureTestingModule({
      providers: [
        CapacitorNotificationPlugin,
        { provide: LOCAL_NOTIFICATIONS, useValue: native },
        { provide: LoggerService, useValue: logger },
      ],
    });
    plugin = TestBed.inject(CapacitorNotificationPlugin);
  });

  it('passes the OS permission through', async () => {
    native.checkPermissions.and.resolveTo({ display: 'denied' });
    expect(await plugin.checkPermission()).toBe('denied');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a failing check as unavailable, not denied, and logs it', async () => {
    native.checkPermissions.and.rejectWith(new Error('boom'));
    expect(await plugin.checkPermission()).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps a request to granted / denied', async () => {
    native.requestPermissions.and.resolveTo({ display: 'granted' });
    expect(await plugin.requestPermission()).toBe('granted');
    native.requestPermissions.and.resolveTo({ display: 'denied' });
    expect(await plugin.requestPermission()).toBe('denied');
  });

  it('reports a failing request as unavailable and logs it', async () => {
    native.requestPermissions.and.rejectWith(new Error('boom'));
    expect(await plugin.requestPermission()).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns the ids still sitting in the tray', async () => {
    native.getDeliveredNotifications.and.resolveTo({ notifications: [{ id: 9001 }, { id: '9002' }] });
    expect(await plugin.getDelivered()).toEqual([9001, 9002]);
  });

  it('returns no ids when the tray cannot be read, without throwing', async () => {
    native.getDeliveredNotifications.and.rejectWith(new Error('boom'));
    expect(await plugin.getDelivered()).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
