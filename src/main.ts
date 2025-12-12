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
import { AppPreferencesService, LanguageService } from '@core/services';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  alertCircleOutline,
  basketOutline,
  calendarOutline,
  cartOutline,
  chatbubblesOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  close as closeIcon,
  createOutline,
  cubeOutline,
  ellipsisVerticalOutline,
  enterOutline,
  exitOutline,
  fastFoodOutline,
  filterOutline,
  homeOutline,
  hourglassOutline,
  layersOutline,
  listOutline,
  locationOutline,
  lockClosedOutline,
  navigateOutline,
  paperPlaneOutline,
  pricetagOutline,
  refreshOutline,
  removeOutline,
  sendOutline,
  settingsOutline,
  shareOutline,
  speedometerOutline,
  starOutline,
  storefrontOutline,
  swapHorizontalOutline,
  timeOutline,
  trashOutline,
  trendingDownOutline
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

function initPreferences(appPreferences: AppPreferencesService): () => Promise<void> {
  return () => appPreferences.getPreferences().then(() => void 0);
}

function localeFactory(language: LanguageService): string {
  return language.getCurrentLocale();
}

addIcons({
  close: closeIcon,
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
  'alert-circle-outline': alertCircleOutline,
  'hourglass-outline': hourglassOutline,
  'time-outline': timeOutline,
  'trending-down-outline': trendingDownOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'list-outline': listOutline,
  'chatbubbles-outline': chatbubblesOutline,
  'star-outline': starOutline,
  'location-outline': locationOutline,
  'pricetag-outline': pricetagOutline,
  'calendar-outline': calendarOutline,
  'speedometer-outline': speedometerOutline,
  'cube-outline': cubeOutline,
  'lock-closed-outline': lockClosedOutline,
  'fast-food-outline': fastFoodOutline,
  'send-outline': sendOutline,
  'enter-outline': enterOutline,
  'exit-outline': exitOutline,
  'paper-plane-outline': paperPlaneOutline,
  'navigate-outline': navigateOutline,
  'storefront-outline': storefrontOutline,
  'ellipsis-vertical-outline': ellipsisVerticalOutline,
  'share-outline': shareOutline,
  'swap-horizontal-outline': swapHorizontalOutline
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
    { provide: APP_INITIALIZER, useFactory: initPreferences, deps: [AppPreferencesService], multi: true },
    { provide: LOCALE_ID, useFactory: localeFactory, deps: [LanguageService] },
  ],
}).catch(err => console.error(err));
