import { Injectable, inject } from '@angular/core';
import { RevenuecatService } from '../upgrade/revenuecat.service';

@Injectable({ providedIn: 'root' })
export class TabsStoreService {
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro$ = this.revenuecat.isPro$;
}

