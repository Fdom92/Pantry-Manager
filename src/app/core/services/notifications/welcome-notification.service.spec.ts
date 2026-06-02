import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { NOTIFICATION_IDS, WELCOME_DELAY_MS } from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { WelcomeNotificationService } from './welcome-notification.service';

class FakePlugin {
  scheduled: Array<{ id: number; title: string; body: string; scheduleAt: Date }> = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (notifs: any[]) => {
    this.scheduled.push(...notifs);
  });
}

class FakeTranslate {
  instant(key: string): string {
    return `[${key}]`;
  }
}

describe('WelcomeNotificationService', () => {
  let service: WelcomeNotificationService;
  let plugin: FakePlugin;

  beforeEach(() => {
    plugin = new FakePlugin();
    TestBed.configureTestingModule({
      providers: [
        WelcomeNotificationService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: TranslateService, useClass: FakeTranslate },
      ],
    });
    service = TestBed.inject(WelcomeNotificationService);
  });

  it('schedules a welcome notification with id WELCOME at now + WELCOME_DELAY_MS', async () => {
    const before = Date.now();
    await service.scheduleWelcomeNotification();
    const after = Date.now();
    expect(plugin.scheduled.length).toBe(1);
    const n = plugin.scheduled[0];
    expect(n.id).toBe(NOTIFICATION_IDS.WELCOME);
    expect(n.title).toBe('[notifications.welcome.title]');
    expect(n.body).toBe('[notifications.welcome.body]');
    const ts = n.scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + WELCOME_DELAY_MS - 50);
    expect(ts).toBeLessThanOrEqual(after + WELCOME_DELAY_MS + 50);
  });

  it('respects an override delayMs param (used by dev panel)', async () => {
    const before = Date.now();
    await service.scheduleWelcomeNotification({ delayMs: 5_000 });
    const ts = plugin.scheduled[0].scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + 5_000 - 50);
    expect(ts).toBeLessThanOrEqual(before + 5_000 + 200);
  });
});
