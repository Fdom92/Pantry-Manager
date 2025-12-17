import { Injectable } from '@angular/core';
import { RevenuecatService } from '@core/services';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ProService {
  constructor(private readonly revenuecat: RevenuecatService) {}

  isPro(): boolean {
    return this.revenuecat.isPro();
  }

  canUseProFeatures(): boolean {
    return !environment.production || this.isPro();
  }
}
