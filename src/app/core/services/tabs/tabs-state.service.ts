import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { environment } from 'src/environments/environment';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

@Injectable()
export class TabsStateService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });

  readonly canUseAgent = computed(() => !environment.production || this.isPro());
}
