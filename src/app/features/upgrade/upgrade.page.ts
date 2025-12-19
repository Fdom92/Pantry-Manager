import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { PlanViewModel } from '@core/models/upgrade';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { NavController } from '@ionic/angular';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonNote,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { PlanCardComponent } from './plan-card/plan-card.component';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonButton,
    IonNote,
    IonBadge,
    CommonModule,
    TranslateModule,
    PlanCardComponent,
  ],
  templateUrl: './upgrade.page.html',
  styleUrls: ['./upgrade.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradePage {
  // DI
  private readonly navCtrl = inject(NavController);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);
  // Data
  planOptions: PlanViewModel[] = [];
  isLoadingPlans = false;
  activePurchaseId: string | null = null;
  private monthlyPriceValue: number | null = null;
  private annualPriceValue: number | null = null;
  readonly isPro$ = this.revenuecat.isPro$;
  readonly benefitKeys = ['upgrade.benefits.agent', 'upgrade.benefits.future'];
  private readonly availablePackages: PurchasesPackage[] = [];

  async skipUpgradeFlow(): Promise<void> {
    await this.navCtrl.navigateRoot('/dashboard');
  }

  async ionViewWillEnter(): Promise<void> {
    if (this.revenuecat.isPro()) {
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    await this.loadAvailablePackages();
  }

  async restorePurchases(): Promise<void> {
    const restored = await this.revenuecat.restore();
    if (restored || this.revenuecat.isPro()) {
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    await this.presentUpgradeToast('upgrade.errors.purchaseFailed');
  }

  async purchasePlan(pkg: PurchasesPackage | null): Promise<void> {
    if (!pkg || this.activePurchaseId) {
      return;
    }
    this.activePurchaseId = pkg.identifier;
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
      await this.presentUpgradeToast('upgrade.errors.purchaseFailed');
    } finally {
      this.activePurchaseId = null;
      this.cdr.markForCheck();
    }
  }

  handleSelectPlan(plan: PlanViewModel): void {
    const pkg = this.findPackageById(plan.id);
    void this.purchasePlan(pkg);
  }

  private async loadAvailablePackages(): Promise<void> {
    this.isLoadingPlans = true;
    const packages = await this.revenuecat.getAvailablePackages();
    this.buildPlanOptions(packages);
    this.isLoadingPlans = false;
    this.cdr.markForCheck();
  }

  private findPackageById(identifier: string): PurchasesPackage | null {
    const match = this.availablePackages.find(p => p.identifier === identifier);
    return match ?? null;
  }

  private buildPlanOptions(packages: PurchasesPackage[]): void {
    this.availablePackages.splice(0, this.availablePackages.length, ...packages);
    this.monthlyPriceValue = null;
    this.annualPriceValue = null;
    this.planOptions = packages.map(pkg => {
      if (pkg.packageType === PACKAGE_TYPE.MONTHLY && pkg.product?.price) {
        this.monthlyPriceValue = pkg.product.price;
      }
      if (pkg.packageType === PACKAGE_TYPE.ANNUAL && pkg.product?.price) {
        this.annualPriceValue = pkg.product.price;
      }
      return this.toPlanViewModel(pkg);
    });
  }

  private toPlanViewModel(pkg: PurchasesPackage): PlanViewModel {
    const typeKey = this.resolvePackageTypeKey(pkg.packageType);
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

  private resolvePackageTypeKey(type: PACKAGE_TYPE): string {
    switch (type) {
      case PACKAGE_TYPE.MONTHLY:
        return 'upgrade.plans.monthly';
      case PACKAGE_TYPE.ANNUAL:
        return 'upgrade.plans.annual';
      default:
        return 'upgrade.plans.other';
    }
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
    if (!this.monthlyPriceValue || !this.annualPriceValue) {
      return null;
    }
    const monthlyYearCost = this.monthlyPriceValue * 12;
    if (!monthlyYearCost) {
      return null;
    }
    const savingsPercent = Math.max(0, Math.round((1 - this.annualPriceValue / monthlyYearCost) * 100));
    if (!savingsPercent) {
      return null;
    }
    return this.translate.instant('upgrade.plans.savings', { value: savingsPercent });
  }

  private async presentUpgradeToast(key: string): Promise<void> {
    const message = this.translate.instant(key);
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}
