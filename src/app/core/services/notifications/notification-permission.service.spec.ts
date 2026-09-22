import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { NotificationPermissionService } from './notification-permission.service';

describe('NotificationPermissionService', () => {
  let service: NotificationPermissionService;
  let plugin: jasmine.SpyObj<CapacitorNotificationPlugin>;

  beforeEach(() => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);

    plugin = jasmine.createSpyObj('CapacitorNotificationPlugin', [
      'checkPermission', 'requestPermission', 'createChannel',
    ]);
    plugin.createChannel.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        NotificationPermissionService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
      ],
    });
    service = TestBed.inject(NotificationPermissionService);
  });

  it('treats an unavailable request as not granted, not a permanent denial', async () => {
    plugin.requestPermission.and.resolveTo('unavailable');

    const granted = await service.request();

    expect(granted).toBe(false);
    expect(service.isUnavailable()).toBe(true);
    expect(service.isPermanentlyDenied()).toBe(false);
  });

  it('re-queries the OS after an unavailable state and adopts the fresh answer', async () => {
    plugin.checkPermission.and.resolveTo('unavailable');
    await service.init();
    expect(service.isUnavailable()).toBe(true);

    plugin.checkPermission.and.resolveTo('granted');
    await service.init();

    expect(plugin.checkPermission).toHaveBeenCalledTimes(2);
    expect(service.isGranted()).toBe(true);
  });
});
