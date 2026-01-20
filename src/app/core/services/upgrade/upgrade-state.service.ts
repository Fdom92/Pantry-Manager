import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { getPackageTypeTranslationKey, computeAnnualSavingsPercent } from '@core/domain/upgrade';
import type { PlanViewModel } from '@core/models/upgrade';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { ToastService, createLatestOnlyRunner, withSignalFlag } from '../shared';
import { RevenuecatService } from './revenuecat.service';

@Injectable()
export class UpgradeStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifecycle = createLatestOnlyRunner(this.destroyRef);
  private readonly navCtrl = inject(NavController);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly toast = inject(ToastService);

  readonly isLoadingPlans = signal(false);
  readonly planOptions = signal<PlanViewModel[]>([]);
  readonly activePurchaseId = signal<string | null>(null);
  readonly isPro$ = this.revenuecat.isPro$;

  private monthlyPriceValue: number | null = null;
  private annualPriceValue: number | null = null;
  private readonly benefitKeys = ['upgrade.benefits.agent', 'upgrade.benefits.future'];
  private readonly availablePackages: PurchasesPackage[] = [];

  async ionViewWillEnter(): Promise<void> {
    if (this.revenuecat.isPro()) {
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    await this.loadAvailablePackages();
  }

  async skipUpgradeFlow(): Promise<void> {
    if (this.lifecycle.isDestroyed()) {
      return;
    }
    await this.navCtrl.navigateRoot('/dashboard');
  }

  async restorePurchases(): Promise<void> {
    const restored = await this.revenuecat.restore();
    if (restored || this.revenuecat.isPro()) {
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    if (!this.lifecycle.isDestroyed()) {
      await this.presentUpgradeToast('upgrade.errors.purchaseFailed');
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
        if (this.lifecycle.isDestroyed()) {
          return;
        }
        await this.navCtrl.navigateRoot('/dashboard');
        return;
      }

      const restored = await this.revenuecat.restore();
      if (restored) {
        if (this.lifecycle.isDestroyed()) {
          return;
        }
        await this.navCtrl.navigateRoot('/dashboard');
        return;
      }
      if (!this.lifecycle.isDestroyed()) {
        await this.presentUpgradeToast('upgrade.errors.purchaseFailed');
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
    const typeKey = getPackageTypeTranslationKey(pkg.packageType);
    const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
    const price = pkg.product?.priceString ?? '-';
    const period = this.translate.instant(isAnnual ? 'upgrade.plans.perYear' : 'upgrade.plans.perMonth');
    const badge = isAnnual ? this.translate.instant('upgrade.plans.badgeBestValue') : null;
    const savings = isAnnual ? this.buildAnnualSavingsLabel() : null;
    const trialLabel = this.buildTrialLabel(pkg);
    const ctaLabel = trialLabel
      ? this.translate.instant('upgrade.actions.startTrial')
      : this.translate.instant('upgrade.actions.select');
    return {
      id: pkg.identifier,
      type: pkg.packageType,
      title: this.translate.instant(typeKey),
      subtitle: pkg.product?.title ?? pkg.identifier,
      price,
      period,
      badge,
      savings,
      trialLabel,
      ctaLabel,
      benefits: this.benefitKeys.map(key => this.translate.instant(key)),
      highlight: isAnnual,
    };
  }

  private buildTrialLabel(pkg: PurchasesPackage): string | null {
    const introPrice = pkg.product?.introPrice;
    if (!introPrice) {
      return null;
    }
    if (introPrice.price === 0) {
      return this.translate.instant('upgrade.plans.trialFree');
    }
    return this.translate.instant('upgrade.plans.trialDiscount', {
      price: introPrice.priceString,
      cycles: introPrice.cycles ?? 1,
    });
  }

  private buildAnnualSavingsLabel(): string | null {
    const savingsPercent = computeAnnualSavingsPercent({
      monthlyPrice: this.monthlyPriceValue,
      annualPrice: this.annualPriceValue,
    });
    if (!savingsPercent) {
      return null;
    }
    return this.translate.instant('upgrade.plans.savings', { value: savingsPercent });
  }

  private async presentUpgradeToast(key: string): Promise<void> {
    const message = this.translate.instant(key);
    await this.toast.present(message);
  }
}
