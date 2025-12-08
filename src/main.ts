import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { addIcons } from 'ionicons';
import { APP_INITIALIZER, LOCALE_ID, importProvidersFrom } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeEn from '@angular/common/locales/en';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import {
  homeOutline,
  basketOutline,
  cartOutline,
  settingsOutline,
  add as addIcon,
  addOutline,
  addCircleOutline,
  close as closeIcon,
  removeOutline,
  trashOutline,
  createOutline,
  refreshOutline,
  filterOutline,
  layersOutline,
  alertCircleOutline,
  hourglassOutline,
  timeOutline,
  trendingDownOutline,
  checkmarkCircleOutline,
  listOutline,
  chatbubblesOutline,
  star,
  starOutline,
  locationOutline,
  pricetagOutline,
  calendarOutline,
  speedometerOutline,
  cubeOutline,
  chevronUpOutline,
  chevronDownOutline,
  lockClosedOutline,
  fastFoodOutline,
  sendOutline,
  enterOutline,
  exitOutline,
  paperPlaneOutline,
} from 'ionicons/icons';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AppPreferencesService, LanguageService } from '@core/services';

registerLocaleData(localeEs);
registerLocaleData(localeEn);

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
  'home-outline': homeOutline,
  'basket-outline': basketOutline,
  'cart-outline': cartOutline,
  'settings-outline': settingsOutline,
  add: addIcon,
  'add-outline': addOutline,
  'add-circle-outline': addCircleOutline,
  close: closeIcon,
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
  'star': star,
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
