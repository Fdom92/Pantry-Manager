import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { NavController } from '@ionic/angular';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { NotificationPermissionService } from './notification-permission.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryNavigationPresetService } from '../pantry/pantry-navigation-preset.service';
import { signal } from '@angular/core';

class FakePlugin {
  scheduled: any[] = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (n: any[]) => { this.scheduled.push(...n); });
  cancel = jasmine.createSpy('cancel').and.resolveTo(undefined);
}

class FakeRegistry {
  defs: NotificationDefinition[] = [];
  getAll() { return this.defs; }
  getById(id: number) { return this.defs.find(d => d.id === id); }
}

class FakePermission {
  init = jasmine.createSpy('init').and.resolveTo();
  request = jasmine.createSpy('request').and.resolveTo(true);
  isGranted = () => true;
  isPermanentlyDenied = () => false;
  wasRequested = true;
  permissionState = signal('granted');
}

class FakePrefs {
  preferences = () => ({
    theme: 'system' as const,
    nearExpiryDays: 15,
    compactView: false,
    notificationsEnabled: true,
    notifyOnExpired: true,
    notifyOnNearExpiry: true,
    notifyOnLowStock: true,
    notificationHour: 9,
    locationOptions: [],
    categoryOptions: [],
    supermarketOptions: [],
  });
  savePreferences = jasmine.createSpy('savePreferences').and.resolveTo();
}

class FakeStore { loadedProducts = signal([]); }
class FakeNav { setPending = () => undefined; }
class FakeNavCtrl { navigateRoot = jasmine.createSpy('navigateRoot').and.resolveTo(); }
class FakeTranslate { instant(k: string) { return k; } }

describe('NotificationSchedulerService — fireDefinitionInFiveSeconds', () => {
  let svc: NotificationSchedulerService;
  let plugin: FakePlugin;
  let registry: FakeRegistry;

  beforeEach(() => {
    plugin = new FakePlugin();
    registry = new FakeRegistry();
    registry.defs = [
      {
        id: NOTIFICATION_IDS.EXPIRED_ITEMS,
        priority: 100,
        isEnabled: () => true,
        build: (_ctx): ScheduledNotification => ({
          id: NOTIFICATION_IDS.EXPIRED_ITEMS,
          title: 'X title',
          body: 'X body',
          scheduleAt: new Date().toISOString(),
        }),
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        NotificationSchedulerService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: NotificationRegistryService, useValue: registry },
        { provide: NotificationPermissionService, useClass: FakePermission },
        { provide: SettingsPreferencesService, useClass: FakePrefs },
        { provide: PantryStoreService, useClass: FakeStore },
        { provide: PantryNavigationPresetService, useClass: FakeNav },
        { provide: NavController, useClass: FakeNavCtrl },
        { provide: TranslateService, useClass: FakeTranslate },
      ],
    });
    svc = TestBed.inject(NotificationSchedulerService);
  });

  it('builds the given definition and schedules in ~5s', async () => {
    const ok = await svc.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(ok).toBeTrue();
    expect(plugin.scheduled.length).toBe(1);
    expect(plugin.scheduled[0].id).toBe(NOTIFICATION_IDS.EXPIRED_ITEMS);
    const delta = plugin.scheduled[0].scheduleAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(4_500);
    expect(delta).toBeLessThan(6_000);
  });

  it('returns false if the definition is not registered', async () => {
    const ok = await svc.fireDefinitionInFiveSeconds(999_999);
    expect(ok).toBeFalse();
    expect(plugin.scheduled.length).toBe(0);
  });

  it('returns false if the definition has nothing to fire (build returns null)', async () => {
    registry.defs[0] = { ...registry.defs[0], build: () => null };
    const ok = await svc.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(ok).toBeFalse();
  });
});
