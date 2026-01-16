import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { computeCanUseAgent } from '@core/domain/tabs';
import { environment } from 'src/environments/environment';
import { RevenuecatService } from '../upgrade/revenuecat.service';

@Injectable()
export class TabsStateService {
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: false });
  readonly canUseAgent = computed(() => computeCanUseAgent(this.isPro(), environment.production));
}
