// Sentry must be initialised before Angular bootstraps so its error handler
// captures errors thrown during component construction. The `beforeSend` hook
// reads a localStorage mirror of the user consent flag — preferences live in
// PouchDB (async) and are not available this early in the boot sequence.
import { init as sentryInit, browserTracingIntegration } from '@sentry/capacitor';
import { init as sentryAngularInit } from '@sentry/angular';
import packageJson from '../package.json';
import { environment } from './environments/environment';
import { STORAGE_KEYS } from '@core/constants';

if (environment.sentry.enabled && environment.sentry.dsn) {
  sentryInit(
    {
      dsn: environment.sentry.dsn,
      environment: environment.sentry.envTag,
      release: `pantrymind@${packageJson.version}`,
      // Privacy: never attach user IP, cookies, or headers by default. We
      // explicitly opt-in to identifying data per scope where needed.
      sendDefaultPii: false,
      // Sampling rates kept low — we are interested in errors, not volume.
      tracesSampleRate: 0.05,
      // Consent gate. The localStorage flag is set by AnalyticsService when
      // the user opts in/out, mirroring the PouchDB preference for sync access.
      beforeSend(event) {
        try {
          return localStorage.getItem(STORAGE_KEYS.ERROR_REPORTING_ENABLED) === 'true'
            ? event
            : null;
        } catch {
          return null;
        }
      },
      integrations: [browserTracingIntegration()],
    },
    sentryAngularInit
  );
}

import { registerLocaleData } from '@angular/common';
import { HttpClient, HttpClientModule, provideHttpClient } from '@angular/common/http';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import localePt from '@angular/common/locales/pt';
import { APP_INITIALIZER, ErrorHandler, LOCALE_ID, importProvidersFrom, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TraceService, createErrorHandler } from '@sentry/angular';
import { LanguageService, SettingsPreferencesService } from '@core/services';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { registerAppIcons } from './app/app-icons';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

registerLocaleData(localeEs);
registerLocaleData(localeEn);
registerLocaleData(localeFr);
registerLocaleData(localeDe);
registerLocaleData(localePt);
registerLocaleData(localeIt);

function httpTranslateLoader(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

function initLanguage(language: LanguageService): () => Promise<void> {
  return () => language.init();
}

function initPreferences(appPreferences: SettingsPreferencesService): () => Promise<void> {
  return () => appPreferences.getPreferences().then(() => void 0);
}

function localeFactory(language: LanguageService): string {
  return language.getCurrentLocale();
}


registerAppIcons();

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({ backButtonText: '' }),
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(
      HttpClientModule,
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        useDefaultLang: true,
        loader: {
          provide: TranslateLoader,
          useFactory: httpTranslateLoader,
          deps: [HttpClient],
        },
      })
    ),
    { provide: APP_INITIALIZER, useFactory: initLanguage, deps: [LanguageService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initPreferences, deps: [SettingsPreferencesService], multi: true },
    { provide: LOCALE_ID, useFactory: localeFactory, deps: [LanguageService] },
    // Sentry: wire global Angular ErrorHandler and the router tracing service.
    // The Sentry SDK is only sending events when consent is granted (see
    // `beforeSend` above), so these providers are safe to register unconditionally.
    ...(environment.sentry.enabled && environment.sentry.dsn
      ? [
          { provide: ErrorHandler, useValue: createErrorHandler({ showDialog: false }) },
          { provide: TraceService, deps: [Router] },
          provideAppInitializer(() => {
            inject(TraceService);
          }),
        ]
      : []),
  ],
}).catch(err => console.error(err));
