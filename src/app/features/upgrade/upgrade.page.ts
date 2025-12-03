import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonicModule, NavController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

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
  ) {}

  offeringPrice: string | null = null;

  goBack(): void {
    this.navCtrl.back();
  }

  async maybeLater(): Promise<void> {
    await this.navCtrl.navigateRoot('/dashboard');
  }

  async ionViewWillEnter(): Promise<void> {
    const offering = await this.revenuecat.getOfferings();
    const monthly = offering?.availablePackages?.find((pkg: any) => pkg.packageType === 'MONTHLY') ?? offering?.monthly;
    const product = monthly?.product;
    this.offeringPrice = product?.priceString ?? null;
  }

  async onBuy(): Promise<void> {
    const success = await this.revenuecat.purchasePro();
    if (success) {
      await this.navCtrl.navigateRoot('/dashboard');
    }
  }

  async onRestore(): Promise<void> {
    const success = await this.revenuecat.restore();
    if (success) {
      await this.navCtrl.navigateRoot('/dashboard');
    }
  }
}
