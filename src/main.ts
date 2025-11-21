import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { addIcons } from 'ionicons';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
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
} from 'ionicons/icons';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

registerLocaleData(localeEs);

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
});

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(routes),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'es' },
  ],
}).catch(err => console.error(err));
