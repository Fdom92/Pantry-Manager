import { Injectable, inject } from '@angular/core';
import type { PlanViewModel } from '@core/models/upgrade';
import { UpgradeStateService } from '@core/services/upgrade';

@Injectable()
export class UpgradeFacade {
  private readonly state = inject(UpgradeStateService);

  readonly isLoadingPlans = this.state.isLoadingPlans;
  readonly planOptions = this.state.planOptions;
  readonly activePurchaseId = this.state.activePurchaseId;
  readonly isPro$ = this.state.isPro$;

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  async skipUpgradeFlow(): Promise<void> {
    await this.state.skipUpgradeFlow();
  }

  async restorePurchases(): Promise<void> {
    await this.state.restorePurchases();
  }

  handleSelectPlan(plan: PlanViewModel): void {
    this.state.handleSelectPlan(plan);
  }
}

