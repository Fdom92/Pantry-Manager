import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { buildPlanMeta } from '@core/domain/upgrade';
import type { PlanViewModel } from '@core/models/upgrade';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { createLatestOnlyRunner, withSignalFlag } from '../shared';
import { RevenuecatService } from './revenuecat.service';

@Injectable()
export class UpgradeStateService {
  // DI
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifecycle = createLatestOnlyRunner(this.destroyRef);
  private readonly navCtrl = inject(NavController);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(RevenuecatService);
  // SIGNALS
  readonly isLoadingPlans = signal(false);
  readonly planOptions = signal<PlanViewModel[]>([]);
  readonly activePurchaseId = signal<string | null>(null);
  readonly isPro$ = this.revenuecat.isPro$;
  // VARIABLES
  private monthlyPriceValue: number | null = null;
  private annualPriceValue: number | null = null;
  private readonly benefitKeys = [
    'upgrade.benefits.agent',
    'upgrade.benefits.history',
    'upgrade.benefits.future',
  ];
  private readonly availablePackages: PurchasesPackage[] = [];

  async ionViewWillEnter(): Promise<void> {
    if (this.revenuecat.isPro()) {
      await this.goDashboard();
      return;
    }
    await this.loadAvailablePackages();
  }

  async skipUpgradeFlow(): Promise<void> {
    await this.goDashboard();
  }

  async restorePurchases(): Promise<void> {
    const restored = await this.revenuecat.restore();
    if (restored || this.revenuecat.isPro()) {
      await this.goDashboard();
      return;
    }
  }

  selectPlan(plan: PlanViewModel): void {
    const pkg = this.findPackageById(plan.id);
    void this.purchasePlan(pkg);
  }

  async purchasePlan(pkg: PurchasesPackage | null): Promise<void> {
    if (!pkg || this.activePurchaseId()) {
      return;
    }
    this.activePurchaseId.set(pkg.identifier);
    try {
      const success = await this.revenuecat.purchasePackage(pkg);
      if (success) {
        await this.goDashboard();
        return;
      }

      const restored = await this.revenuecat.restore();
      if (restored) {
        await this.goDashboard();
        return;
      }
    } finally {
      this.activePurchaseId.set(null);
    }
  }

  private async loadAvailablePackages(): Promise<void> {
    await withSignalFlag(this.isLoadingPlans, async () => {
      const packages = await this.revenuecat.getAvailablePackages();
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      this.buildPlanOptions(packages);
    });
  }

  private findPackageById(identifier: string): PurchasesPackage | null {
    const match = this.availablePackages.find(p => p.identifier === identifier);
    return match ?? null;
  }

  private buildPlanOptions(packages: PurchasesPackage[]): void {
    this.availablePackages.splice(0, this.availablePackages.length, ...packages);
    this.monthlyPriceValue = null;
    this.annualPriceValue = null;

    const plans = packages.map(pkg => {
      if (pkg.packageType === PACKAGE_TYPE.MONTHLY && pkg.product?.price) {
        this.monthlyPriceValue = pkg.product.price;
      }
      if (pkg.packageType === PACKAGE_TYPE.ANNUAL && pkg.product?.price) {
        this.annualPriceValue = pkg.product.price;
      }
      return this.toPlanViewModel(pkg);
    });

    this.planOptions.set(plans);
  }

  private toPlanViewModel(pkg: PurchasesPackage): PlanViewModel {
    const meta = buildPlanMeta({
      pkg,
      benefitKeys: this.benefitKeys,
      monthlyPrice: this.monthlyPriceValue,
      annualPrice: this.annualPriceValue,
    });
    const trialLabel = meta.trial
      ? meta.trial.kind === 'free'
        ? this.translate.instant('upgrade.plans.trialFree')
        : this.translate.instant('upgrade.plans.trialDiscount', {
            price: meta.trial.price,
            cycles: meta.trial.cycles,
          })
      : null;
    const savingsLabel = meta.savingsPercent
      ? this.translate.instant('upgrade.plans.savings', { value: meta.savingsPercent })
      : null;
    return {
      id: meta.id,
      type: meta.type,
      title: this.translate.instant(meta.titleKey),
      subtitle: meta.subtitle,
      price: meta.price,
      periodLabel: this.translate.instant(meta.periodKey),
      badgeLabel: meta.badgeKey ? this.translate.instant(meta.badgeKey) : null,
      savingsLabel,
      trialLabel,
      ctaLabel: this.translate.instant(meta.ctaKey),
      benefits: meta.benefitsKeys.map(key => this.translate.instant(key)),
      highlight: meta.highlight,
    };
  }

  private async goDashboard(): Promise<void> {
    if (this.lifecycle.isDestroyed()) {
      return;
    }
    await this.navCtrl.navigateRoot('/dashboard');
  }

}
