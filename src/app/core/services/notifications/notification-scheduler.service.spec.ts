import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PREFERENCES } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { LoggerService } from '../shared/logger.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { NotificationPermissionService } from './notification-permission.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WelcomeNotificationService } from './welcome-notification.service';

describe('NotificationSchedulerService', () => {
  let scheduler: NotificationSchedulerService;
  let prefs: { preferences: ReturnType<typeof signal>; savePreferences: jasmine.Spy };
  let permission: jasmine.SpyObj<NotificationPermissionService>;
  let plugin: jasmine.SpyObj<CapacitorNotificationPlugin>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    // Construction must not register native listeners; scheduleAll must think it is native.
    const isNative = spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);

    prefs = {
      preferences: signal({ ...DEFAULT_PREFERENCES, notificationsEnabled: true }),
      savePreferences: jasmine.createSpy('savePreferences').and.resolveTo(),
    };
    permission = jasmine.createSpyObj('NotificationPermissionService',
      ['init', 'isGranted', 'isPermanentlyDenied', 'isUnavailable', 'request'],
      { wasRequested: false });
    permission.init.and.resolveTo();
    plugin = jasmine.createSpyObj('CapacitorNotificationPlugin', ['schedule', 'cancel', 'getDelivered']);
    plugin.cancel.and.resolveTo();
    plugin.schedule.and.resolveTo();
    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);

    TestBed.configureTestingModule({
      providers: [
        NotificationSchedulerService,
        { provide: NotificationRegistryService, useValue: { getAll: () => [], getById: () => undefined } },
        { provide: NotificationPermissionService, useValue: permission },
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: SettingsPreferencesService, useValue: prefs },
        { provide: PantryStoreService, useValue: { loadedProducts: signal([]) } },
        { provide: PantryNavigationPresetService, useValue: { setPending: () => undefined } },
        { provide: NavController, useValue: { navigateRoot: () => Promise.resolve(true) } },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
        { provide: WelcomeNotificationService, useValue: { cancelWelcomeNotification: () => Promise.resolve() } },
        { provide: AnalyticsService, useValue: analytics },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug']) },
      ],
    });
    scheduler = TestBed.inject(NotificationSchedulerService);
    isNative.and.returnValue(true);
  });

  it('leaves the user toggle alone when the plugin is unavailable', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isUnavailable.and.returnValue(true);
    permission.isPermanentlyDenied.and.returnValue(false);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).not.toHaveBeenCalled();
    expect(permission.request).not.toHaveBeenCalled();
  });

  it('leaves the toggle alone when the request itself fails', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isPermanentlyDenied.and.returnValue(false);
    permission.isUnavailable.and.returnValues(false, true); // before request, after request
    permission.request.and.resolveTo(false);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).not.toHaveBeenCalled();
  });

  it('still switches the toggle off after a real denial', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isUnavailable.and.returnValue(false);
    permission.isPermanentlyDenied.and.returnValue(true);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).toHaveBeenCalledWith(jasmine.objectContaining({ notificationsEnabled: false }));
    expect(permission.request).not.toHaveBeenCalled();
  });

  it('reports the notifications left in the tray', async () => {
    plugin.getDelivered.and.resolveTo([9001, 9003]);
    await scheduler.reportDelivered();
    expect(analytics.track).toHaveBeenCalledWith('notification_delivered_seen', { count: 2, ids: '9001,9003' });
  });

  it('sorts the ids before joining them', async () => {
    plugin.getDelivered.and.resolveTo([9003, 9001]);
    await scheduler.reportDelivered();
    expect(analytics.track).toHaveBeenCalledWith('notification_delivered_seen', { count: 2, ids: '9001,9003' });
  });

  it('stays quiet when the tray is empty', async () => {
    plugin.getDelivered.and.resolveTo([]);
    await scheduler.reportDelivered();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('reads the tray before cancelling anything', async () => {
    permission.isGranted.and.returnValue(true);
    plugin.getDelivered.and.resolveTo([201]);
    const order: string[] = [];
    plugin.getDelivered.and.callFake(() => {
      order.push('getDelivered');
      return Promise.resolve([201]);
    });
    plugin.cancel.and.callFake(() => {
      order.push('cancel');
      return Promise.resolve();
    });

    await scheduler.scheduleAll();

    expect(order[0]).toBe('getDelivered');
    expect(order.indexOf('cancel')).toBeGreaterThan(order.indexOf('getDelivered'));
  });

  it('reports the snapshot taken before the cancel', async () => {
    permission.isGranted.and.returnValue(true);
    plugin.getDelivered.and.resolveTo([201]);

    await scheduler.scheduleAll();
    await scheduler.reportDelivered();

    expect(analytics.track).toHaveBeenCalledWith('notification_delivered_seen', { count: 1, ids: '201' });
    expect(plugin.getDelivered).toHaveBeenCalledTimes(1);
  });

  it('takes a fresh snapshot on the next scheduling pass after reporting', async () => {
    permission.isGranted.and.returnValue(true);
    plugin.getDelivered.and.resolveTo([201]);

    await scheduler.scheduleAll();
    await scheduler.reportDelivered();

    plugin.getDelivered.and.resolveTo([]);
    await scheduler.scheduleAll();
    await scheduler.reportDelivered();

    expect(plugin.getDelivered).toHaveBeenCalledTimes(2);
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });
});
