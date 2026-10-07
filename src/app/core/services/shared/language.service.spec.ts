import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { DEFAULT_LANGUAGE } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { LanguageService } from './language.service';
import { LoggerService } from './logger.service';

describe('LanguageService', () => {
  let translate: { addLangs: jasmine.Spy; setDefaultLang: jasmine.Spy; use: jasmine.Spy };
  let deviceLocale = 'en-US';

  function createService(locale: string): LanguageService {
    deviceLocale = locale;
    translate = {
      addLangs: jasmine.createSpy('addLangs'),
      setDefaultLang: jasmine.createSpy('setDefaultLang'),
      use: jasmine.createSpy('use').and.callFake(() => of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useValue: translate },
        { provide: AnalyticsService, useValue: { track: jasmine.createSpy('track') } },
        { provide: LoggerService, useValue: { warn: jasmine.createSpy('warn') } },
      ],
    });
    return TestBed.inject(LanguageService);
  }

  /** A relaunch: new service instances, same device storage and locale. */
  function relaunch(locale: string): LanguageService {
    TestBed.resetTestingModule();
    return createService(locale);
  }

  beforeEach(() => {
    localStorage.clear();
    spyOnProperty(navigator, 'languages', 'get').and.callFake(() => [deviceLocale]);
  });
  afterEach(() => localStorage.clear());

  it('follows the device locale when the user never chose a language', async () => {
    const service = createService('es-ES');

    await service.init();

    expect(service.getCurrentLanguage()).toBe('es');
    expect(translate.use).toHaveBeenCalledWith('es');
  });

  it('falls back to the default language when the device locale is unsupported', async () => {
    const service = createService('ja-JP');

    await service.init();

    expect(service.getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('keeps the language the user picked after the app is relaunched', async () => {
    const first = createService('en-US');
    await first.init();
    await first.setLanguage('de');

    const second = relaunch('en-US');
    await second.init();

    expect(second.getCurrentLanguage()).toBe('de');
    expect(translate.use).toHaveBeenCalledWith('de');
  });

  it('prefers the stored choice over a device locale that changed later', async () => {
    const first = createService('en-US');
    await first.init();
    await first.setLanguage('fr');

    const second = relaunch('pt-BR');
    await second.init();

    expect(second.getCurrentLanguage()).toBe('fr');
  });

  it('ignores a stored language that is no longer supported', async () => {
    localStorage.setItem('app:language', 'xx');
    const service = createService('it-IT');

    await service.init();

    expect(service.getCurrentLanguage()).toBe('it');
  });
});
