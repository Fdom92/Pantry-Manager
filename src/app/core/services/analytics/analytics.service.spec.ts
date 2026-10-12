import { TestBed } from '@angular/core/testing';
import type { WritableSignal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from './analytics.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { LoggerService } from '../shared/logger.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

describe('AnalyticsService.trackOnce', () => {
  let service: AnalyticsService;
  let trackSpy: jasmine.Spy;

  function setReady(ready: boolean): void {
    (service as unknown as { readySignal: WritableSignal<boolean> }).readySignal.set(ready);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: SettingsPreferencesService, useValue: {} },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['info', 'warn']) },
        { provide: TranslateService, useValue: {} },
        { provide: UpgradeRevenuecatService, useValue: {} },
        { provide: LocalStorageService, useValue: {} },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    trackSpy = spyOn(service, 'track');
    setReady(true);
  });

  it('sends the event the first time a key is seen', () => {
    service.trackOnce('empty_state_shown', { key: 'a' }, 'a');

    expect(trackSpy).toHaveBeenCalledOnceWith('empty_state_shown', { key: 'a' });
  });

  it('ignores the same key the next time, however often the caller fires', () => {
    for (let i = 0; i < 5; i++) {
      service.trackOnce('empty_state_shown', { key: 'a' }, 'a');
    }

    expect(trackSpy).toHaveBeenCalledTimes(1);
  });

  it('still sends a different key', () => {
    service.trackOnce('empty_state_shown', { key: 'a' }, 'a');
    service.trackOnce('empty_state_shown', { key: 'b' }, 'b');

    expect(trackSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps keys of different events apart', () => {
    service.trackOnce('event_one', undefined, 'same');
    service.trackOnce('event_two', undefined, 'same');

    expect(trackSpy).toHaveBeenCalledTimes(2);
  });

  it('does not use up the key while analytics is not ready, so it still reports after opt-in', () => {
    setReady(false);
    service.trackOnce('empty_state_shown', { key: 'a' }, 'a');
    expect(trackSpy).not.toHaveBeenCalled();

    setReady(true);
    service.trackOnce('empty_state_shown', { key: 'a' }, 'a');

    expect(trackSpy).toHaveBeenCalledTimes(1);
  });
});
