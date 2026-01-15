import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { computeCanUseAgent } from '@core/domain/tabs';
import { environment } from 'src/environments/environment';
import { TabsStoreService } from './tabs-store.service';

@Injectable()
export class TabsStateService {
  private readonly store = inject(TabsStoreService);

  readonly isPro = toSignal(this.store.isPro$, { initialValue: false });
  readonly canUseAgent = computed(() => computeCanUseAgent(this.isPro(), environment.production));
}

