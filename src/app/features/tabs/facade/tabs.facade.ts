import { Injectable, inject } from '@angular/core';
import { TabsStateService } from '@core/services/tabs';

@Injectable()
export class TabsFacade {
  private readonly state = inject(TabsStateService);

  readonly isPro = this.state.isPro;
  readonly canUseAgent = this.state.canUseAgent;
}

