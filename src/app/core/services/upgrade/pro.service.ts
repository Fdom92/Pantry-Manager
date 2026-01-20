import { inject, Injectable } from '@angular/core';
import { RevenuecatService } from './revenuecat.service';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ProService {
  private readonly revenuecat = inject(RevenuecatService);

  isPro(): boolean {
    return this.revenuecat.isPro();
  }

  canUseProFeatures(): boolean {
    return !environment.production || this.isPro();
  }
}
