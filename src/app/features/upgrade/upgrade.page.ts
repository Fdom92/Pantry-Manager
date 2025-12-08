import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonicModule, NavController } from '@ionic/angular';
import { ToastController } from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { PlanCardComponent } from './plan-card/plan-card.component';

interface PlanViewModel {
  id: string;
  type: PACKAGE_TYPE;
  title: string;
  subtitle: string;
  price: string;
  period: string;
  badge?: string | null;
  savings?: string | null;
  trialLabel?: string | null;
  ctaLabel: string;
  benefits: string[];
  highlight: boolean;
}

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule, PlanCardComponent],
  templateUrl: './upgrade.page.html',
  styleUrls: ['./upgrade.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradePage {
  readonly isPro$ = this.revenuecat.isPro$;
  readonly benefitKeys = ['upgrade.benefits.agent', 'upgrade.benefits.future'];

  constructor(
    private readonly navCtrl: NavController,
    private readonly revenuecat: RevenuecatService,
    private readonly toastCtrl: ToastController,
    private readonly translate: TranslateService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  plans: PlanViewModel[] = [];
  loadingPackages = false;
  purchasingId: string | null = null;
  private monthlyPrice: number | null = null;
  private annualPrice: number | null = null;

  goBack(): void {
    this.navCtrl.back();
  }

  async maybeLater(): Promise<void> {
    await this.navCtrl.navigateRoot('/dashboard');
  }

  async ionViewWillEnter(): Promise<void> {
    if (this.revenuecat.isPro()) {
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    await this.loadPackages();
  }

  async onRestore(): Promise<void> {
    const restored = await this.revenuecat.restore();
    if (restored || this.revenuecat.isPro()) {
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    await this.presentToast('upgrade.errors.purchaseFailed');
  }

  private async loadPackages(): Promise<void> {
    this.loadingPackages = true;
    const packages = await this.revenuecat.getAvailablePackages();
    this.buildPlans(packages);
    this.loadingPackages = false;
    this.cdr.markForCheck();
  }

  async purchase(pkg: PurchasesPackage | null): Promise<void> {
    if (!pkg || this.purchasingId) {
      return;
    }
    this.purchasingId = pkg.identifier;
    this.cdr.markForCheck();
    try {
      const success = await this.revenuecat.purchasePackage(pkg);
      if (success) {
        await this.navCtrl.navigateRoot('/dashboard');
        return;
      }
      // Handle cases where the subscription already exists but purchase call returns falsy.
      const restored = await this.revenuecat.restore();
      if (restored) {
        await this.navCtrl.navigateRoot('/dashboard');
        return;
      }
      await this.presentToast('upgrade.errors.purchaseFailed');
    } finally {
      this.purchasingId = null;
      this.cdr.markForCheck();
    }
  }

  onSelectPlan(plan: PlanViewModel): void {
    const pkg = this.findPackage(plan.id);
    void this.purchase(pkg);
  }

  private findPackage(identifier: string): PurchasesPackage | null {
    const match = this.planPackages.find(p => p.identifier === identifier);
    return match ?? null;
  }

  private readonly planPackages: PurchasesPackage[] = [];

  private buildPlans(packages: PurchasesPackage[]): void {
    this.planPackages.splice(0, this.planPackages.length, ...packages);
    this.monthlyPrice = null;
    this.annualPrice = null;
    this.plans = packages.map(pkg => {
      if (pkg.packageType === PACKAGE_TYPE.MONTHLY && pkg.product?.price) {
        this.monthlyPrice = pkg.product.price;
      }
      if (pkg.packageType === PACKAGE_TYPE.ANNUAL && pkg.product?.price) {
        this.annualPrice = pkg.product.price;
      }
      return this.toViewModel(pkg);
    });
  }

  private toViewModel(pkg: PurchasesPackage): PlanViewModel {
    const typeKey = this.getPackageTypeKey(pkg.packageType);
    const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
    const price = pkg.product?.priceString ?? '-';
    const period = this.translate.instant(isAnnual ? 'upgrade.plans.perYear' : 'upgrade.plans.perMonth');
    const badge = isAnnual ? this.translate.instant('upgrade.plans.badgeBestValue') : null;
    const savings = isAnnual ? this.getAnnualSavingsLabel() : null;
    const trialLabel = this.getTrialLabel(pkg);
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

  private getPackageTypeKey(type: PACKAGE_TYPE): string {
    switch (type) {
      case PACKAGE_TYPE.MONTHLY:
        return 'upgrade.plans.monthly';
      case PACKAGE_TYPE.ANNUAL:
        return 'upgrade.plans.annual';
      default:
        return 'upgrade.plans.other';
    }
  }

  private getTrialLabel(pkg: PurchasesPackage): string | null {
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

  private getAnnualSavingsLabel(): string | null {
    if (!this.monthlyPrice || !this.annualPrice) {
      return null;
    }
    const monthlyYearCost = this.monthlyPrice * 12;
    if (!monthlyYearCost) {
      return null;
    }
    const savingsPercent = Math.max(0, Math.round((1 - this.annualPrice / monthlyYearCost) * 100));
    if (!savingsPercent) {
      return null;
    }
    return this.translate.instant('upgrade.plans.savings', { value: savingsPercent });
  }

  private async presentToast(key: string): Promise<void> {
    const message = this.translate.instant(key);
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}
