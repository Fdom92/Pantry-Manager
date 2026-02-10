import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { environment } from 'src/environments/environment';
import { RevenuecatService } from '../upgrade/revenuecat.service';

@Injectable()
export class TabsStateService {
  // DI
  private readonly revenuecat = inject(RevenuecatService);
  // SIGNALS
  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });
  // COMPUTED SIGNALS
  readonly canUseAgent = computed(() => !environment.production || this.isPro());
}
