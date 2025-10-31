import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  basketOutline,
  cartOutline,
  settingsOutline,
  add as addIcon,
  addOutline,
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
  starOutline,
  locationOutline,
  pricetagOutline,
  calendarOutline,
  speedometerOutline,
  chevronUpOutline,
  chevronDownOutline,
} from 'ionicons/icons';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

addIcons({
  'home-outline': homeOutline,
  'basket-outline': basketOutline,
  'cart-outline': cartOutline,
  'settings-outline': settingsOutline,
  add: addIcon,
  'add-outline': addOutline,
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
  'star-outline': starOutline,
  'location-outline': locationOutline,
  'pricetag-outline': pricetagOutline,
  'calendar-outline': calendarOutline,
  'speedometer-outline': speedometerOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideAnimations(),
    provideRouter(routes),
  ],
}).catch(err => console.error(err));
