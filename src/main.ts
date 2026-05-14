import { registerLocaleData } from '@angular/common';
import { HttpClient, HttpClientModule, provideHttpClient } from '@angular/common/http';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import localePt from '@angular/common/locales/pt';
import { APP_INITIALIZER, LOCALE_ID, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { LanguageService, SettingsPreferencesService } from '@core/services';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  addOutline,
  alertCircle,
  alertCircleOutline,
  analyticsOutline,
  apertureOutline,
  appsOutline,
  archiveOutline,
  arrowForwardOutline,
  arrowUndoOutline,
  basketOutline,
  calendarOutline,
  cartOutline,
  checkmark,
  checkmarkCircle,
  checkmarkCircleOutline,
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
  ellipse,
  ellipsisVerticalOutline,
  enterOutline,
  eyeOffOutline,
  eyeOutline,
  fastFoodOutline,
  filterOutline,
  homeOutline,
  hourglassOutline,
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
  notificationsOutline,
  paperPlaneOutline,
  pricetagOutline,
  refreshOutline,
  remove,
  removeCircleOutline,
  removeOutline,
  settingsOutline,
  shareOutline,
  shareSocialOutline,
  skullOutline,
  sparklesOutline,
  star,
  starOutline,
  statsChartOutline,
  storefrontOutline,
  sunnyOutline,
  timeOutline,
  trashOutline,
  warning,
  warningOutline
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
  'analytics-outline': analyticsOutline
});

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
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
  ],
}).catch(err => console.error(err));
