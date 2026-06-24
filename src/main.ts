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
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  addOutline,
  alarmOutline,
  alertCircle,
  alertCircleOutline,
  analyticsOutline,
  apertureOutline,
  appsOutline,
  archiveOutline,
  arrowForwardOutline,
  arrowUndoOutline,
  barChartOutline,
  basketOutline,
  bulbOutline,
  calendarOutline,
  cartOutline,
  checkmark,
  checkmarkCircle,
  checkmarkCircleOutline,
  checkmarkOutline,
  chevronDownOutline,
  chevronForwardOutline,
  chevronUpOutline,
  close,
  closeCircle,
  closeCircleOutline,
  closeOutline,
  createOutline,
  cubeOutline,
  desktopOutline,
  documentOutline,
  documentTextOutline,
  chatbubbleOutline,
  ellipse,
  ellipsisVerticalOutline,
  enterOutline,
  eyeOffOutline,
  eyeOutline,
  fastFoodOutline,
  filterOutline,
  homeOutline,
  hourglassOutline,
  imagesOutline,
  infinite,
  infiniteOutline,
  informationCircle,
  informationOutline,
  layersOutline,
  leafOutline,
  listOutline,
  lockClosedOutline,
  moonOutline,
  navigateOutline,
  notificationsOffOutline,
  notificationsOutline,
  paperPlaneOutline,
  pricetagOutline,
  refreshOutline,
  reloadOutline,
  remove,
  removeCircleOutline,
  removeOutline,
  schoolOutline,
  searchOutline,
  sendOutline,
  settingsOutline,
  shareOutline,
  shareSocialOutline,
  shieldCheckmarkOutline,
  skullOutline,
  sparklesOutline,
  star,
  starOutline,
  statsChartOutline,
  storefrontOutline,
  sunnyOutline,
  timeOutline,
  toggleOutline,
  trashOutline,
  trendingDownOutline,
  trendingUpOutline,
  rocketOutline,
  warning,
  warningOutline,
  pencilOutline
} from 'ionicons/icons';
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

addIcons({
  add: add,
  remove: remove,
  close: close,
  star: star,
  checkmark: checkmark,
  infinite: infinite,
  ellipse: ellipse,
  'home-outline': homeOutline,
  'basket-outline': basketOutline,
  'cart-outline': cartOutline,
  'settings-outline': settingsOutline,
  'add-outline': addOutline,
  'add-circle-outline': addCircleOutline,
  'remove-outline': removeOutline,
  'trash-outline': trashOutline,
  'create-outline': createOutline,
  'refresh-outline': refreshOutline,
  'chevron-up-outline': chevronUpOutline,
  'chevron-down-outline': chevronDownOutline,
  'filter-outline': filterOutline,
  'layers-outline': layersOutline,
  'alert-circle': alertCircle,
  'alert-circle-outline': alertCircleOutline,
  'hourglass-outline': hourglassOutline,
  'time-outline': timeOutline,
  'checkmark-circle': checkmarkCircle,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'information-circle': informationCircle,
  'warning': warning,
  'list-outline': listOutline,
  'star-outline': starOutline,
  'pricetag-outline': pricetagOutline,
  'calendar-outline': calendarOutline,
  'cube-outline': cubeOutline,
  'fast-food-outline': fastFoodOutline,
  'enter-outline': enterOutline,
  'paper-plane-outline': paperPlaneOutline,
  'navigate-outline': navigateOutline,
  'storefront-outline': storefrontOutline,
  'ellipsis-vertical-outline': ellipsisVerticalOutline,
  'share-outline': shareOutline,
  'aperture-outline': apertureOutline,
  'sparkles-outline': sparklesOutline,
  'remove-circle-outline': removeCircleOutline,
  'sunny-outline': sunnyOutline,
  'moon-outline': moonOutline,
  'desktop-outline': desktopOutline,
  'chatbubble-outline': chatbubbleOutline,
  'document-outline': documentOutline,
  'document-text-outline': documentTextOutline,
  'close-outline': closeOutline,
  'arrow-forward-outline': arrowForwardOutline,
  'information-circle-outline': informationOutline,
  'notifications-outline': notificationsOutline,
  'skull-outline': skullOutline,
  'close-circle-outline': closeCircleOutline,
  'eye-outline': eyeOutline,
  'warning-outline': warningOutline,
  'close-circle': closeCircle,
  'stats-chart-outline': statsChartOutline,
  'share-social-outline': shareSocialOutline,
  'archive-outline': archiveOutline,
  'infinite-outline': infiniteOutline,
  'apps-outline': appsOutline,
  'leaf-outline': leafOutline,
  'eye-off-outline': eyeOffOutline,
  'arrow-undo-outline': arrowUndoOutline,
  'lock-closed-outline': lockClosedOutline,
  'analytics-outline': analyticsOutline,
  'bulb-outline': bulbOutline,
  'school-outline': schoolOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'trending-down-outline': trendingDownOutline,
  'trending-up-outline': trendingUpOutline,
  'rocket-outline': rocketOutline,
  'reload-outline': reloadOutline,
  'images-outline': imagesOutline,
  'bar-chart-outline': barChartOutline,
  'checkmark-outline': checkmarkOutline,
  'send-outline': sendOutline,
  'alarm-outline': alarmOutline,
  'search-outline': searchOutline,
  'notifications-off-outline': notificationsOffOutline,
  'toggle-outline': toggleOutline,
  'pencil-outline': pencilOutline,
  'chevron-forward-outline': chevronForwardOutline
});

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
