import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonicModule, NavController } from '@ionic/angular';
import { ToastController } from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './upgrade.page.html',
  styleUrls: ['./upgrade.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradePage {
  readonly isPro$ = this.revenuecat.isPro$;
  readonly benefitKeys = [
    'upgrade.benefits.agent',
  ];

  constructor(
    private readonly navCtrl: NavController,
    private readonly revenuecat: RevenuecatService,
    private readonly toastCtrl: ToastController,
    private readonly translate: TranslateService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  packages: PurchasesPackage[] = [];
  purchasingId: string | null = null;

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

  getProductTitle(pkg: PurchasesPackage): string {
    return pkg.product?.title ?? pkg.identifier;
  }

  getProductPrice(pkg: PurchasesPackage): string {
    return pkg.product?.priceString ?? '-';
  }

  getPackageLabel(pkg: PurchasesPackage): string {
    const key = this.getPackageTypeKey(pkg.packageType);
    return this.translate.instant(key);
  }

  private async loadPackages(): Promise<void> {
    const packages = await this.revenuecat.getAvailablePackages();
    this.packages = packages;
    this.cdr.markForCheck();
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

  async purchase(pkg: PurchasesPackage): Promise<void> {
    if (!pkg || this.purchasingId) {
      return;
    }
    this.purchasingId = pkg.identifier;
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
    }
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
