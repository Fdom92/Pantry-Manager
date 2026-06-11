import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { buildPlanMeta, sortPackagesByPreference } from '@core/domain/upgrade';
import type { PlanViewModel } from '@core/models/upgrade';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { createLatestOnlyRunner, withSignalFlag } from '@core/utils';
import { environment } from 'src/environments/environment';
import { UpgradeRevenuecatService } from './upgrade-revenuecat.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';

@Injectable()
export class UpgradeStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifecycle = createLatestOnlyRunner(this.destroyRef);
  private readonly navCtrl = inject(NavController);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly analytics = inject(AnalyticsService);

  readonly isLoadingPlans = signal(false);
  readonly planOptions = signal<PlanViewModel[]>([]);
  readonly activePurchaseId = signal<string | null>(null);
  readonly isPro$ = this.revenuecat.isPro$;

  private monthlyPriceValue: number | null = null;
  private annualPriceValue: number | null = null;
  private readonly benefitKeys = [
    'upgrade.benefits.reposition',
    'upgrade.benefits.waste',
    'upgrade.benefits.analysis',
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
    this.analytics.track(ANALYTICS_EVENTS.UPGRADE_TAPPED, {
      plan_id: pkg.identifier,
      package_type: pkg.packageType,
    });
    this.analytics.track(ANALYTICS_EVENTS.UPGRADE_PURCHASE_STARTED, {
      plan_id: pkg.identifier,
      package_type: pkg.packageType,
    });
    try {
      const success = await this.revenuecat.purchasePackage(pkg);
      const finalised = success || (await this.revenuecat.restore());
      if (finalised) {
        this.reviewPrompt.markEngagement();
        this.analytics.track(ANALYTICS_EVENTS.UPGRADE_PURCHASE_COMPLETED, {
          plan_id: pkg.identifier,
          package_type: pkg.packageType,
        });
        await this.goDashboard();
      }
    } finally {
      this.activePurchaseId.set(null);
    }
  }

  private async loadAvailablePackages(): Promise<void> {
    if (!environment.production) {
      this.planOptions.set(this.buildMockPlanOptions());
      return;
    }
    await withSignalFlag(this.isLoadingPlans, async () => {
      const packages = await this.revenuecat.getAvailablePackages();
      if (this.lifecycle.isDestroyed()) {
        return;
      }
      this.buildPlanOptions(packages);
    });
  }

  private buildMockPlanOptions(): PlanViewModel[] {
    return [
      {
        id: 'mock_annual',
        type: PACKAGE_TYPE.ANNUAL,
        title: this.translate.instant('upgrade.plans.annual'),
        subtitle: '',
        price: '€29.99',
        periodLabel: this.translate.instant('upgrade.plans.perYear'),
        badgeLabel: this.translate.instant('upgrade.plans.badgeBestValue'),
        savingsLabel: this.translate.instant('upgrade.plans.savings', { value: '37' }),
        trialLabel: null,
        ctaLabel: this.translate.instant('upgrade.actions.select'),
        benefits: this.benefitKeys.map(k => this.translate.instant(k)),
        highlight: true,
      },
      {
        id: 'mock_monthly',
        type: PACKAGE_TYPE.MONTHLY,
        title: this.translate.instant('upgrade.plans.monthly'),
        subtitle: '',
        price: '€3.99',
        periodLabel: this.translate.instant('upgrade.plans.perMonth'),
        badgeLabel: null,
        savingsLabel: null,
        trialLabel: this.translate.instant('upgrade.plans.trialFree'),
        ctaLabel: this.translate.instant('upgrade.actions.startTrial'),
        benefits: this.benefitKeys.map(k => this.translate.instant(k)),
        highlight: false,
      },
    ];
  }

  private findPackageById(identifier: string): PurchasesPackage | null {
    const match = this.availablePackages.find(p => p.identifier === identifier);
    return match ?? null;
  }

  private buildPlanOptions(packages: PurchasesPackage[]): void {
    // Highlighted annual plan renders first (above the fold).
    const ordered = sortPackagesByPreference(packages, [PACKAGE_TYPE.ANNUAL, PACKAGE_TYPE.MONTHLY]);
    this.availablePackages.splice(0, this.availablePackages.length, ...ordered);
    this.monthlyPriceValue = null;
    this.annualPriceValue = null;

    // Collect prices before mapping: annual savings % needs the monthly price
    // regardless of package order.
    for (const pkg of ordered) {
      if (pkg.packageType === PACKAGE_TYPE.MONTHLY && pkg.product?.price) {
        this.monthlyPriceValue = pkg.product.price;
      }
      if (pkg.packageType === PACKAGE_TYPE.ANNUAL && pkg.product?.price) {
        this.annualPriceValue = pkg.product.price;
      }
    }

    this.planOptions.set(ordered.map(pkg => this.toPlanViewModel(pkg)));
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
        : this.translate.instant('upgrade.plans.trialDiscount', { price: meta.trial.price, cycles: meta.trial.cycles })
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
